import * as vscode from 'vscode';
import { readTextFile, writeTextFile } from '../base/fs';
import { Logger } from '../base/logger';
import { findLastMatch } from '../../common/utils';
import { basename, extname, join, relative } from 'path';
import { getConfig, normalizePathForWorkspace } from '../base/workspace';
import { getErrorMessage } from '../../common/error';
import { toUnixPath, dirnameOrEmpty, isAbsolutePath, isPathUnderOrEqual } from '../../common/platform';
import { debounce, escapeRegExp } from 'lodash';
import { Cproject } from './cproject';
import { processCCppPropertiesConfig } from './cCppProperties';
import { BuildConfig } from '../../common/types/generate';

/**
 * 源文件的相对路径
 */
interface SourceFiles {
  /**
   * 不含后缀名的.c源文件基本名，例如`cpuport`
   */
  c: string[];

  /**
   *  不含后缀名的.S源文件基本名，例如`context_gcc`
   */
  S: string[];

  /**
   *  不含后缀名的.s源文件基本名，例如`context_gcc`
   */
  s: string[];
}

/**
 * 日志记录器
 */
const logger = new Logger('main/project/makefile');

/**
 * 源文件后缀名
 */
const SUBDIR_SOURCE_EXTNAMES = ['.c', '.S', '.s'];

/**
 * 忽略的后缀名
 */
const IGNORE_EXTNAMES = ['.o', '.d', '.a', '.elf', '.bin', '.hex', '.map', '.list', '.lst', '.out'];

/**
 * gcc的include指令正则表达式
 */
const INCLUDE_PATH_REGEX = /(\s+-I|-include|-T\s*)"([^"]*)"/g;

/**
 * makefile处理器
 */
export class MakefileProcessor {
  /**
   * 是否有构建配置
   */
  private static HasBuildConfig = false;

  /**
   * 消抖处理函数映射，键为文件夹的路径，值为处理函数
   */
  private static DebouncedHandleMap = new Map<string, (relativeDir: string) => Promise<void> | undefined>();

  /**
   * 项目当前的根目录
   */
  private static CurrentProjectRoot: vscode.Uri;

  /**
   * 项目配置
   */
  private static OriginProjectRoot: string;

  /**
   * 选择的构建配置，各项获取不到则为空字符串
   */
  private static BuildConfig: BuildConfig;

  /**
   * makefile变化时自动重新优化
   */
  private static IsWatchMakefile: boolean;

  /**
   * 把绝对路径转为相对路径的事件发射器。
   */
  private static ChangeAbsolutePathToReleativeEmitter = new vscode.EventEmitter<void>();

  /**
   * 设置要处理的环境，应在初始时和切换配置时调用。
   * @param wsFolder 工作区文件夹
   * @param buildConfig 选择的构建配置
   */
  public static async SetProcessConfig(wsFolder: vscode.Uri, buildConfig: BuildConfig) {
    logger.info('SetBuildConfig for workspaceFolder:', wsFolder.fsPath);
    this.CurrentProjectRoot = wsFolder;
    this.BuildConfig = buildConfig;
    // 尝试分析原项目的根路径，然后让用户确认
    const wsFolderPath = toUnixPath(wsFolder.fsPath);
    const originProjectRoot = await this.GuessOriginProjectRoot();
    if (originProjectRoot) {
      if (isAbsolutePath(originProjectRoot)) {
        if (!isPathUnderOrEqual(originProjectRoot, wsFolderPath)) {
          const result = await vscode.window.showInputBox({
            prompt: vscode.l10n.t('Please enter the absolute path to the root directory of the original project'),
            value: originProjectRoot,
            ignoreFocusOut: true,
          });
          if (result) {
            this.OriginProjectRoot = toUnixPath(result);
          }
        }
      } else {
        this.OriginProjectRoot = toUnixPath(join(wsFolderPath, originProjectRoot));
      }
    }
    this.IsWatchMakefile = getConfig(this.CurrentProjectRoot, 'makefileProcessor.watch', true);
  }

  /**
   * 设置是否有构建配置。
   * @param hasBuildConfig 是否有构建配置
   */
  public static SetHasBuildConfig(hasBuildConfig: boolean) {
    this.HasBuildConfig = hasBuildConfig;
  }

  /**
   * 获取makefile的uri。
   * @returns uri
   */
  private static GetMakefileUri() {
    return vscode.Uri.joinPath(this.CurrentProjectRoot, this.BuildConfig.name, 'makefile');
  }

  /**
   * 获取sources.mk的uri。
   * @returns uri
   */
  private static GetSourceMkUri() {
    return vscode.Uri.joinPath(this.CurrentProjectRoot, this.BuildConfig.name, 'sources.mk');
  }

  /**
   * 获取makefile.defs的uri。
   * @returns uri
   */
  private static GetMakefileDefsUri() {
    return vscode.Uri.joinPath(this.CurrentProjectRoot, 'makefile.defs');
  }

  /**
   * 获取makefile.targets的uri。
   * @returns uri
   */
  private static GetMakefileTargetsUri() {
    return vscode.Uri.joinPath(this.CurrentProjectRoot, 'makefile.targets');
  }

  /**
   * 获取全部subdir.mk文件的uri。
   * @returns uri
   */
  private static GetSubdirMkUris() {
    const buildUri = vscode.Uri.joinPath(this.CurrentProjectRoot, this.BuildConfig.name);
    return vscode.workspace.findFiles(new vscode.RelativePattern(buildUri, '**/subdir.mk'));
  }

  /**
   * 猜测原本项目的根目录。
   */
  private static async GuessOriginProjectRoot() {
    const uri = vscode.Uri.joinPath(this.CurrentProjectRoot, this.BuildConfig.name, 'rt-thread/src/subdir.mk');
    let guessPath = '';
    try {
      const fileContent = await readTextFile(uri);
      const matches = fileContent.matchAll(INCLUDE_PATH_REGEX);
      for (const match of matches) {
        const p = toUnixPath(match[2]);
        logger.debug('p:', p);
        if (p.endsWith('rt-thread/include')) {
          guessPath = p.slice(0, p.length - 'rt-thread/include'.length);
          break;
        }
      }
    } catch {
      logger.debug('guess error:', uri.fsPath);
    }
    return guessPath;
  }

  /**
   * 处理单个Makefile文件，不抛出出现的错误。
   *
   * 1. 在编译文件的gcc或g++指令前添加提示正在编译的文件，并使用`@`屏蔽命令及其参数，例如：
   *
   * ```makefile
   * applications/%.o: ../applications/%.c
   *     arm-none-eabi-gcc ...
   *
   * rt-thread/libcpu/arm/cortex-m4/%.o: ../rt-thread/libcpu/arm/cortex-m4/%.S
   *     arm-none-eabi-gcc ...
   * ```
   *
   * 将转换为：
   *
   * ```makefile
   * applications/%.o: ../applications/%.c
   *     -@echo compiling $<...
   *     @arm-none-eabi-gcc ...
   *
   * rt-thread/libcpu/arm/cortex-m4/%.o: ../rt-thread/libcpu/arm/cortex-m4/%.S
   *     -@echo compiling $<...
   *     @arm-none-eabi-gcc ...
   * ```
   *
   * 2. 尝试把绝对路径转为相对路径，例如：
   *
   * ```makefile
   *     -I"D:\RT-ThreadStudio\workspace\rtthread-vscode\applications"
   * ```
   *
   * 将转换为：
   *
   * ```makefile
   * rtthread.elf: $(OBJS) $(USER_OBJS)
   *     -I"../applications"
   * ```
   *
   * @param uri Makefile文件uri
   * @param params 生成参数
   */
  private static async ProcessMakefile(uri: vscode.Uri): Promise<void> {
    try {
      const { toolchainPrefix } = this.BuildConfig;
      const linkRegex = new RegExp(`^(.*?\\.elf:.*\\r?\\n)\\t${toolchainPrefix}(gcc|g\\+\\+)`, 'm');
      const compileRegex = new RegExp(`^(.*?\\.o:.*\\r?\\n)\\t${toolchainPrefix}(gcc|g\\+\\+)`, 'gm');
      const oldContent = await readTextFile(uri);
      let newContent = oldContent.replace(linkRegex, (...match) => {
        return `${match[1]}\t-@echo linking ...\r\n\t@${toolchainPrefix}${match[2]}`;
      });
      newContent = newContent.replace(compileRegex, (...match) => {
        return `${match[1]}\t-@echo compiling $<...\r\n\t@${toolchainPrefix}${match[2]}`;
      });
      newContent = newContent.replace(INCLUDE_PATH_REGEX, (...match) => {
        if (isAbsolutePath(match[2])) {
          if (isPathUnderOrEqual(this.CurrentProjectRoot.fsPath, match[2])) {
            // 可能已经移动，先尝试转为工作区文件夹的相对路径
            const buildAbsolutePath = join(this.CurrentProjectRoot.fsPath, this.BuildConfig.name);
            const from = toUnixPath(buildAbsolutePath);
            const to = toUnixPath(match[2]);
            return `${match[1]}"${toUnixPath(relative(from, to))}"`;
          } else if (this.OriginProjectRoot) {
            const buildAbsolutePath = join(this.OriginProjectRoot, this.BuildConfig.name);
            const from = toUnixPath(buildAbsolutePath);
            const to = toUnixPath(match[2]);
            const relativePath = `${match[1]}"${toUnixPath(relative(from, to))}"`;
            return relativePath;
          }
        }
        return match[0];
      });
      if (oldContent !== newContent) {
        await writeTextFile(uri, newContent);
        logger.debug(`change ${uri.fsPath} to: ${newContent}'`);
        this.ChangeAbsolutePathToReleativeEmitter.fire();
      }
    } catch (error) {
      logger.error(`An error occurred while processing ${uri}:`, error);
    }
  }

  /**
   * 处理所选构建配置的各个Makefile文件，处理详情见{@link ProcessMakefile}。
   *
   * @note 应先调用{@link SetProcessConfig}设置构建配置
   *
   * @param event 文件变化事件类型
   */
  public static async ProcessMakefiles(): Promise<void> {
    if (!this.HasBuildConfig) {
      return;
    }
    logger.info('processMakefiles...');
    const makefileUris: vscode.Uri[] = [this.GetMakefileUri(), this.GetMakefileTargetsUri()];
    const uris = await this.GetSubdirMkUris();
    makefileUris.push(...uris);
    logger.trace('makefileUris:', makefileUris);
    await Promise.all(makefileUris.map((uri) => this.ProcessMakefile(uri)));
  }

  /**
   * 向全部subdir.mk文件中添加头文件路径。
   * @param paths 待添加的头文件绝对路径列表
   */
  public static async AddIncludePaths(paths: string[]) {
    const buildUri = vscode.Uri.joinPath(this.CurrentProjectRoot, this.BuildConfig.name);
    const relativeDirs = paths.map((path) => normalizePathForWorkspace(this.CurrentProjectRoot, path));
    const relativeDirsForBuild = paths.map((path) => normalizePathForWorkspace(buildUri, path));
    const uris = await this.GetSubdirMkUris();
    const fn = async (subdirMkUri: vscode.Uri) => {
      const includeSet = new Set<string>(relativeDirsForBuild);
      const fileContent = await readTextFile(subdirMkUri);
      const compileRegex = new RegExp(`(^\\t@?${this.BuildConfig.toolchainPrefix}(gcc|g\\+\\+))\\s+.*`, 'gm');
      const newFileContent = fileContent.replaceAll(compileRegex, (...match) => {
        let compileLine = match[0];
        const includeRegex = /( -I\s*)"([^"]*)"/g;
        compileLine = compileLine.replaceAll(includeRegex, (...includeMatch) => {
          const includePath = toUnixPath(includeMatch[2]);
          includeSet.add(includePath);
          return '';
        });
        const newIncludePathsString = Array.from(includeSet)
          .map((v) => ` -I"${v}"`)
          .sort()
          .join('');
        const defineRegex = /( -D\s*)([\w_]+)(=[^ ]*)?/g;
        const lastMatch = findLastMatch(defineRegex, compileLine);
        if (lastMatch) {
          const insertIndex = lastMatch.index + lastMatch[0].length;
          compileLine = compileLine.slice(0, insertIndex) + newIncludePathsString + compileLine.slice(insertIndex);
        } else {
          const insertIndex = match[1].length;
          compileLine = compileLine.slice(0, insertIndex) + newIncludePathsString + compileLine.slice(insertIndex);
        }
        return compileLine;
      });
      if (newFileContent !== fileContent) {
        logger.info(`change ${subdirMkUri.fsPath} to: ${newFileContent}'`);
        await writeTextFile(subdirMkUri, newFileContent);
      }
    };
    await Promise.all(uris.map((uri) => fn(uri)));
    const compilerPath = getConfig(this.CurrentProjectRoot, 'generate.compilerPath', 'arm-none-eabi-gcc');
    await processCCppPropertiesConfig(this.CurrentProjectRoot, compilerPath, this.BuildConfig);
    await Cproject.AddIncludePaths(this.CurrentProjectRoot, this.BuildConfig.name, relativeDirs);
  }

  /**
   * 移除顶级目录中的指定子目录（和该子目录的所有子目录）的编译规则。
   *
   * - 移除makefil中的`-include 对应目录.mk`。
   *
   * - 移除sources.mk中的`SUBDIRS`的`对应目录 \`。
   *
   * @param relativeDir 源文件相对于项目根目录的路径
   */
  private static async RemoveFragmentRuleOfTopRecursively(relativeDir: string) {
    logger.info('removeFragmentRuleOfTop of dir:', relativeDir);
    try {
      let itemToRemove;

      const makefileUri = this.GetMakefileUri();
      const makefileContent = await readTextFile(makefileUri);
      itemToRemove = relativeDir === '' ? '' : `${relativeDir}/`;
      const matchSubdir = relativeDir ? '\\S*' : '';
      const regexInclude = new RegExp(
        `(^-include (${escapeRegExp(itemToRemove) + matchSubdir})subdir\\.mk)\\r?\\n`,
        'gm',
      );
      const newMakefileContent = makefileContent.replace(regexInclude, (...match) => {
        if (isPathUnderOrEqual(relativeDir, match[2])) {
          logger.info(`remove line "${match[1]}" in makefile`);
          return '';
        }
        return match[0];
      });

      if (newMakefileContent !== makefileContent) {
        await writeTextFile(makefileUri, newMakefileContent);
        logger.info(`change ${makefileUri.fsPath} to: ${newMakefileContent}'`);
      }

      const sourcesMkUri = this.GetSourceMkUri();
      const sourcesMkContent = await readTextFile(sourcesMkUri);
      itemToRemove = relativeDir ? relativeDir : '.';
      const regexSource = new RegExp(`^((${escapeRegExp(itemToRemove)}\\S*) \\\\)\\r?\\n`, 'gm');
      const newSourcesMkContent = sourcesMkContent.replace(regexSource, (...match) => {
        if (isPathUnderOrEqual(relativeDir, match[2])) {
          logger.info(`remove line "${match[1]}" in sources.mk`);
          return '';
        }
        return match[0];
      });
      if (newSourcesMkContent !== sourcesMkContent) {
        await writeTextFile(sourcesMkUri, newSourcesMkContent);
        logger.info(`change ${sourcesMkUri.fsPath} to: ${newSourcesMkContent}'`);
      }
    } catch (error) {
      logger.error(error);
    }
  }

  /**
   * 获取指定目录下的第一级{@link SourceFiles 源文件}，不包括{@link BuildConfig}已指定排除的。
   * @param relativeDir 源文件相对于项目根目录的路径
   * @returns 不包含扩展名的源文件的基本名
   */
  private static async GetSourceFilesOfDir(relativeDir: string): Promise<SourceFiles> {
    const result: SourceFiles = {
      c: [],
      S: [],
      s: [],
    };
    const sourceDir = vscode.Uri.joinPath(this.CurrentProjectRoot, relativeDir);
    const files = await vscode.workspace.fs.readDirectory(sourceDir);
    for (const [fileName, fileType] of files) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const filePath = `${relativeDir}/${fileName}`;
      if (this.BuildConfig.excludingPaths.some((v) => v === filePath)) {
        logger.info('is excludingPath:', filePath);
        continue;
      }
      const extName = extname(fileName) as unknown as `.${keyof SourceFiles}`;
      const baseName = basename(fileName, extName);
      switch (extName) {
        case '.c':
          result.c.push(baseName);
          break;
        case '.S':
          result.S.push(baseName);
          break;
        case '.s':
          result.s.push(baseName);
          break;
        // TODO: CPP？
      }
    }
    return result;
  }

  /**
   * 处理某个源文件目录的相关的Makefile。
   *
   * 更新对应的subdir.mdk中构建变量为当前存在的源文件（排序）。
   *
   * 如果写入subdir.mk失败，认为是源文件目录被删除了，调用{@link RemoveFragmentRuleOfTopRecursively}。
   *
   * @param relativeDir 源文件相对于项目根目录的路径，如果是根目录则为空字符串
   */
  private static async HandleSourceFileChange(relativeDir: string) {
    /**
     * {@link SUBDIR_SOURCE_EXTNAMES 源文件}目录相对于项目根目录的相对路径，例如空字符串、`../applications/`
     */
    logger.info('ProcessMakefile of dir:', relativeDir);
    try {
      if (this.BuildConfig.excludingPaths.some((v) => isPathUnderOrEqual(v, relativeDir))) {
        logger.info('is excludingPath:', relativeDir);
        // TODO: 如果原来编译了，需要清除编译？
        return;
      }
      const sourceFiles = await this.GetSourceFilesOfDir(relativeDir);
      logger.debug(`sourceFiles of ${relativeDir}:`, sourceFiles);
      try {
        const subdirMkUri = vscode.Uri.joinPath(
          this.CurrentProjectRoot,
          this.BuildConfig.name,
          relativeDir,
          'subdir.mk',
        );
        const relativeDirPrefex = relativeDir === '' ? '' : `${relativeDir}/`;
        const fileContent = await readTextFile(subdirMkUri);
        const buildVars = {
          S_SRCS: '',
          C_SRCS: '',
          S_UPPER_SRCS: '',
          OBJS: '',
          S_DEPS: '',
          S_UPPER_DEPS: '',
          C_DEPS: '',
        };
        const OBJSSet = new Set<string>();
        for (const obj of sourceFiles.s.sort()) {
          buildVars.S_SRCS += `\\\r\n../${relativeDirPrefex}${obj}.s `;
          buildVars.S_DEPS += `\\\r\n./${relativeDirPrefex}${obj}.d `;
          OBJSSet.add(obj);
        }
        for (const obj of sourceFiles.c.sort()) {
          buildVars.C_SRCS += `\\\r\n../${relativeDirPrefex}${obj}.c `;
          buildVars.C_DEPS += `\\\r\n./${relativeDirPrefex}${obj}.d `;
          OBJSSet.add(obj);
        }
        for (const obj of sourceFiles.S.sort()) {
          buildVars.S_UPPER_SRCS += `\\\r\n../${relativeDirPrefex}${obj}.S `;
          buildVars.S_UPPER_DEPS += `\\\r\n./${relativeDirPrefex}${obj}.d `;
          OBJSSet.add(obj);
        }
        if (OBJSSet.size) {
          for (const obj of Array.from(OBJSSet).sort()) {
            buildVars.OBJS += `\\\r\n./${relativeDirPrefex}${obj}.o `;
          }
        }

        let buildVarsString = '';
        for (const key in buildVars) {
          const buildVarString = buildVars[key as keyof typeof buildVars];
          if (buildVarString.length) {
            if (buildVarsString.length) {
              buildVarsString += '\r\n';
            }
            buildVarsString += `${key} += ${buildVarString}\r\n`;
          }
        }
        buildVarsString += '\r\n\r\n';
        // 替换首次出现的：以`xxx +=`开始（可选）、连续两个空行结束的内容
        const newFileContent = fileContent.replace(
          /\r?\n(?:[\w_]+\s*\+=[\s\S]*?\r?\n)?\r?\n\r?\n/,
          '\r\n' + buildVarsString,
        );
        if (newFileContent !== fileContent) {
          await writeTextFile(subdirMkUri, newFileContent);
          logger.info(`change ${subdirMkUri.fsPath} to: ${newFileContent}'`);
        }
      } catch (error) {
        // TODO: 支持在资源管理器中右键添加编译？
        logger.error(`subdir.mk of ${relativeDir} not found: ${getErrorMessage(error)}`);
      }
    } catch (error) {
      await this.RemoveFragmentRuleOfTopRecursively(relativeDir);
      logger.info(`source dir ${relativeDir} not found: ${getErrorMessage(error)}`);
    }
  }

  /**
   * 处理文件或文件夹发生变化。
   *
   * 如果未调用过{@link SetProcessConfig}，则忽略处理。
   *
   * 如果是源文件则调用{@link HandleSourceFileChange}。
   *
   * 如果是makefile相关文件则调用{@link ProcessMakefile}。
   *
   * @note 由此函数负责忽略不需要处理的（不在选择的工作区文件夹；不是makefile相关文件...）。
   *
   * @param uri 文件uri
   */
  public static async HandleFileChange(uri: vscode.Uri) {
    logger.trace('HandleFileChange:', uri.fsPath);
    if (
      !this.HasBuildConfig ||
      !isPathUnderOrEqual(this.CurrentProjectRoot.fsPath, uri.fsPath) ||
      IGNORE_EXTNAMES.some((v) => uri.fsPath.endsWith(v))
    ) {
      return;
    }
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    if (relativePath.startsWith('.')) {
      return;
    }
    const isSourceFile = SUBDIR_SOURCE_EXTNAMES.some((v) => uri.fsPath.endsWith(v));
    let fileType = vscode.FileType.Unknown;
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (
        this.IsWatchMakefile &&
        relativePath.startsWith(this.BuildConfig.name + '/') &&
        (relativePath.endsWith('/makefile') || relativePath.endsWith('/subdir.mk'))
      ) {
        this.ProcessMakefile(uri);
        return;
      }
      fileType = stat.type;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        logger.info('delete or remove event');
        fileType = isSourceFile ? vscode.FileType.File : vscode.FileType.Directory;
      } else {
        throw error;
      }
    }
    if (fileType === vscode.FileType.File) {
      if (!isSourceFile) {
        logger.trace('not a source file');
        return;
      }
    } else if (fileType !== vscode.FileType.Directory) {
      return;
    }

    logger.debug('HandleFileChange:', relativePath);
    const relativePathDir = fileType === vscode.FileType.File ? dirnameOrEmpty(relativePath) : relativePath;
    // 同一个文件夹消抖
    let debouncedPopulateMakefile = this.DebouncedHandleMap.get(relativePathDir);
    if (!debouncedPopulateMakefile) {
      debouncedPopulateMakefile = debounce(this.HandleSourceFileChange.bind(this), 1000);
      this.DebouncedHandleMap.set(relativePathDir, debouncedPopulateMakefile);
    }
    debouncedPopulateMakefile(relativePathDir);
  }

  /**
   * 监听已经把makefile的绝对路径转为相对路径。
   */
  public static OnDidChangeAbsolutePathToReleative = this.ChangeAbsolutePathToReleativeEmitter.event;

  /**
   * 释放资源。
   */
  public static Dispose() {
    this.ChangeAbsolutePathToReleativeEmitter.dispose();
  }
}
