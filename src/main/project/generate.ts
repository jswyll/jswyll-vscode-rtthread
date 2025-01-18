import * as vscode from 'vscode';
import { load } from 'cheerio';
import { basename, delimiter, extname, join } from 'path';
import { Logger } from '../base/logger';
import { ExtensionToWebviewDatas, WebviewToExtensionData } from '../../common/types/type';
import { getConfig, normalizePathForWorkspace, parsePath, updateConfig } from '../base/workspace';
import { getErrorMessage } from '../../common/error';
import {
  TASKS,
  CONFIG_GROUP,
  GCC_COMPILE_PROBLEM_MATCHER_NAME,
  GCC_LINK_PROBLEM_MATCHER_NAME,
  TASKS_JSON_RELATIVE_PATH,
} from '../base/constants';
import { EXTENSION_ID } from '../../common/constants';
import { assertParam } from '../../common/assert';
import {
  calculateEnvPathString,
  convertPathToUnixLike,
  dirnameOrEmpty,
  isAbsolutePath,
  removeExeSuffix,
} from '../../common/platform';
import { readTextFile, writeJsonFile, writeTextFile, parseJsonFile, existsAsync } from '../base/fs';
import { isJsonObject } from '../../common/utils';
import { TdesignValidateError } from '../base/error';
import { MakefileProcessor } from './makefile';
import { ExtensionGenerateSettings, TasksJson } from '../base/type';
import { spawnPromise } from '../base/process';
import { processCCppPropertiesConfig } from './cCppProperties';
import { WebviewPanel } from '../base/webview';
import { BuildConfig, DoGenerateParams, GenerateSettings, ProjcfgIni } from '../../common/types/generate';
import { TdesignCustomValidateResult } from '../../common/types/vscode';
import { isEqual } from 'lodash';

/**
 * 生成的参数
 */
interface GenerateParamsInternal extends DoGenerateParams {
  /**
   * 工作区文件夹
   */
  wsFolder: vscode.Uri;

  /**
   * 选择的构建配置，各项获取不到则为空字符串
   */
  buildConfig?: BuildConfig;

  /**
   * 从`.settings/projcfg.ini`文件中解析的项目配置
   */
  projcfgIni: ProjcfgIni;

  /**
   * 额外的环境变量PATH
   */
  exraPaths: string[];

  /**
   * 额外的环境变量
   */
  extraVar: Record<string, string | undefined>;
}

/**
 * 支持的调试服务器类型
 */
type SupportedDebugServer = (typeof supportedDebugServer)[number];

/**
 * 生成完成事件的发射器
 */
const generateEmitter = new vscode.EventEmitter<void>();

/**
 * 选择的Env根目录发生变化的发射器
 */
const envRootChangeEmitter = new vscode.EventEmitter<void>();

/**
 * 选择的Env根目录发生变化
 */
const onDidEnvRootChange = envRootChangeEmitter.event;

/**
 * 日志记录器
 */
const logger = new Logger('main/project/generate');

/**
 * 可能的GCC编译器文件名称，不包含文件扩展名
 */
const compilerFileNames = [
  'arm-none-eabi-gcc',
  'riscv-none-embed-gcc',
  'riscv64-unknown-elf-gcc',
  'riscv32-unknown-elf-gcc',
  'riscv-nuclei-elf-gcc',
  'riscv-none-embed-gcc',
  'arm-linux-musleabi-gcc',
];

/**
 * openocd配置文件的路径
 */
const openocdConfigFilePath = `.vscode/openocd.cfg`;

/**
 * 支持的调试服务器
 */
const supportedDebugServer = ['openocd', 'pyocd', 'jlink'] as const;

/**
 * webview配置面板
 */
let webviewPanel: WebviewPanel | undefined;

/**
 * 向webview发送消息。
 * @param msg 消息
 */
function postMessageToWebview(msg: ExtensionToWebviewDatas) {
  if (webviewPanel?.postMessage(msg)) {
    logger.info('extension send', msg);
  }
}

/**
 * 销毁webview，如果已经销毁则无操作。
 */
function disposeWebviewPanel() {
  webviewPanel?.dispose();
}

/**
 * 获取文件夹下所有文件基本名为指定数组中的文件。
 * @param dirs 文件夹列表
 * @param basenameWithoutExts 文件
 * @returns 所有匹配的文件的绝对路径
 */
async function getfsPathsIndirs(dirs: string[], basenameWithoutExts: string[]) {
  const absolutePaths = new Set<string>();
  const dirUris = dirs.map((dir) => vscode.Uri.file(dir));
  for (const dir of dirUris) {
    try {
      const dirFiles = await vscode.workspace.fs.readDirectory(dir);
      for (const [fileName, fileType] of dirFiles) {
        if (fileType !== vscode.FileType.File) {
          continue;
        }
        const basenameWithoutExt = basename(fileName, extname(fileName));
        if (basenameWithoutExts.some((file) => basenameWithoutExt === file)) {
          absolutePaths.add(convertPathToUnixLike(vscode.Uri.joinPath(dir, fileName).fsPath));
        }
      }
    } catch {}
  }
  return Array.from(absolutePaths);
}

/**
 * 解析`.settings/projcfg.ini`文件中的项目配置，不抛出出现的错误。
 * @param wsFolder 工作区文件夹
 * @returns 项目配置
 */
async function parseProjcfgIni(wsFolder: vscode.Uri) {
  logger.debug('parseProjcfgIni...');
  const projcfgIni: ProjcfgIni = {
    chipName: undefined,
    projectRootDir: undefined,
    hardwareAdapter: undefined,
  };
  try {
    const projcfgIniText = await readTextFile(vscode.Uri.joinPath(wsFolder, '.settings/projcfg.ini'));
    const matchOutputProjectPath = projcfgIniText.match(/^output_project_path=(.+)/im);
    const matchProjectName = projcfgIniText.match(/^project_name=(.+)/im);
    if (matchOutputProjectPath && matchProjectName) {
      const outputProjectPath = matchOutputProjectPath[1].trim().replace(/\\:/g, ':');
      const projectName = matchProjectName[1].trim();
      projcfgIni.projectRootDir = convertPathToUnixLike(join(outputProjectPath, projectName));
    }
    let match;
    if ((match = projcfgIniText.match(/^chip_name=(.+)/im))) {
      projcfgIni.chipName = match[1].trim();
    }
    if ((match = projcfgIniText.match(/^hardware_adapter=(.+)/im))) {
      projcfgIni.hardwareAdapter = match[1].trim();
    }
  } catch (error) {
    logger.error(error);
  }
  return projcfgIni;
}

/**
 * 解析`.cproject`文件中的构建配置列表，发生异常时返回空数组。
 * @param wsFolder 工作区文件夹
 * @returns RT-Thread Studio项目的各个构建配置
 */
async function parseBuildConfigs(wsFolder: vscode.Uri) {
  logger.debug('parseBuildConfigs...');
  const buildConfigs: BuildConfig[] = [];
  let cprojectFileContent = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';
  try {
    cprojectFileContent = await readTextFile(vscode.Uri.joinPath(wsFolder, '.cproject'));
    const $ = load(cprojectFileContent, { xml: true });
    /**
     * 匹配如下路径格式的正则
     * ```
     * "${workspace_loc://${ProjName}/drivers//include}"
     * "${workspace_loc://${ProjName}//rt-thread/libcpu/arm/cortex-m4}"
     * ```
     */
    const pathValueregex = /"?\$\{workspace_loc:\/+\$\{ProjName\}\/+(.*)\}"?$/;
    $('storageModule>cconfiguration').each((i, element) => {
      const cDefineValues = new Set<string>();
      const cIncludePathValues = new Set<string>();
      const cIncludeFileValues = new Set<string>();
      const excludingPathValues = new Set<string>();
      const configuration = $(element).find('storageModule configuration[artifactName]');
      const name = $(configuration).attr('name') || '';
      const toolchainPrefix = $(configuration).find('folderInfo toolChain option[name="Prefix"]').attr('value') || '';
      const tools = $(configuration).find('folderInfo toolChain tool');
      $(tools)
        .find('option[id*=c.compiler.defs],option[id*=c.compiler.option.definedsymbols]')
        .first()
        .children()
        .each((_, element) => {
          cDefineValues.add(element.attribs.value);
        });
      $(tools)
        .find(
          'option[id*=c.compiler.include.paths],option[id*=c.compiler.option.includepaths],option[id*=c.compiler.tasking.include]',
        )
        .first()
        .children()
        .each((_, element) => {
          const match = element.attribs.value?.trim().match(pathValueregex);
          if (match) {
            cIncludePathValues.add(match[1]);
          }
        });
      $(tools)
        .find('option[id*=c.compiler.include.files],option[id*=c.compiler.option.includefiles]')
        .first()
        .children()
        .each((_, element) => {
          const match = element.attribs.value?.trim().match(pathValueregex);
          if (match) {
            cIncludeFileValues.add(match[1]);
          }
        });

      const sourceEntries = $(configuration).find('sourceEntries entry');
      sourceEntries.each((_, element) => {
        const sourcePath = $(element).attr('excluding') || '';
        for (const p of sourcePath.split('|')) {
          excludingPathValues.add(convertPathToUnixLike(p.replace(/^\/\//, '')));
        }
      });
      buildConfigs.push({
        artifactName: $(configuration).attr('artifactName') || '',
        name,
        toolchainPrefix,
        cDefines: Array.from(cDefineValues),
        cIncludePaths: Array.from(cIncludePathValues).sort(),
        cIncludeFiles: Array.from(cIncludeFileValues),
        excludingPaths: Array.from(excludingPathValues),
      });
    });
  } catch (error) {
    logger.error('Failed to read the `.cproject` file in workspace Folder:', error);
  }
  logger.debug('buildConfigs:', buildConfigs);
  return buildConfigs;
}

/**
 * 获取生成组的扩展配置。
 * @param scope 作用域
 * @param key 键
 * @param defaultValue 值不存在时，返回的默认值
 */
function getGenerateConfig<T extends keyof GenerateSettings>(
  scope: vscode.ConfigurationScope,
  key: T,
  defaultValue: GenerateSettings[T],
) {
  const section = `${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}`;
  return vscode.workspace.getConfiguration(section, scope).get(key, defaultValue);
}

/**
 * 获取上次的生成设置。
 * @param wsFolder 工作区文件夹
 * @returns 上次的生成设置
 */
function getLastGenerateSettings(wsFolder: vscode.Uri): GenerateSettings {
  logger.info('getLastGenerateConfig...');
  return {
    projectType: getGenerateConfig(wsFolder, 'projectType', 'RT-Thread Studio'),
    buildConfigName: getGenerateConfig(wsFolder, 'buildConfigName', 'Debug'),
    makeBaseDirectory: getGenerateConfig(wsFolder, 'makeBaseDirectory', '${workspaceFolder}/Debug'),
    makeToolPath: getGenerateConfig(wsFolder, 'makeToolPath', ''),
    envPath: getGenerateConfig(wsFolder, 'envPath', 'c:/env-windows'),
    artifactPath: getGenerateConfig(wsFolder, 'artifactPath', 'rt-thread.elf'),
    rttDir: getGenerateConfig(wsFolder, 'rttDir', 'rt-thread'),
    toolchainPath: getGenerateConfig(wsFolder, 'toolchainPath', ''),
    studioInstallPath: getGenerateConfig(wsFolder, 'studioInstallPath', 'D:/RT-ThreadStudio'),
    compilerPath: getGenerateConfig(wsFolder, 'compilerPath', ''),
    debuggerAdapter: getGenerateConfig(wsFolder, 'debuggerAdapter', 'STLink'),
    debuggerInterface: getGenerateConfig(wsFolder, 'debuggerInterface', 'SWD'),
    chipName: getGenerateConfig(wsFolder, 'chipName', ''),
    debuggerServerPath: getGenerateConfig(wsFolder, 'debuggerServerPath', ''),
    cmsisPack: getGenerateConfig(wsFolder, 'cmsisPack', ''),
    defaultBuildTask: getGenerateConfig(wsFolder, 'defaultBuildTask', TASKS.BUILD.name),
    customExtraPathVar: getGenerateConfig(wsFolder, 'customExtraPathVar', []),
    customExtraVars: getGenerateConfig(wsFolder, 'customExtraVars', {}),
  };
}

/**
 * 获取调试服务器的路径。
 *
 * 如果是JLink调试服务器，把基本名中的jlink替换成`JLinkGDBServerCL`。
 *
 * @param debuggerServerPath 调试服务器路径或文件名
 * @returns 处理后的调试服务器路径
 */
function getDebuggerServerPath(debuggerServerPath: string) {
  const baseName = basename(debuggerServerPath, extname(debuggerServerPath));
  let dir = dirnameOrEmpty(debuggerServerPath);
  dir = dir ? `${dir}/` : '';
  return dir + baseName.replace(/^jlink/i, 'JLinkGDBServerCL');
}

/**
 * 获取用于cortex-debug的调试服务器的类型名称
 * @param debuggerServerPath 绝对路径或基本名
 * @returns 已支持的{@link supportedDebugServer}，或返回`undefined`
 */
function getDebugServer(debuggerServerPath: string): SupportedDebugServer | undefined {
  const baseName = basename(debuggerServerPath, extname(debuggerServerPath)).toLowerCase();
  if (baseName === 'jlinkexe') {
    return 'jlink';
  }
  if (!supportedDebugServer.includes(baseName as SupportedDebugServer)) {
    return undefined;
  }
  return baseName as SupportedDebugServer;
}

/**
 * 判断调试服务器是否是JLink。
 *
 * @note linux下安装的segger，文件名是`jlinkExe`。
 *
 * @param debuggerServerPath 调试服务器路径或文件名
 * @returns 是否是JLink
 */
function isJlinkDebugger(debuggerServerPath: string) {
  return getDebugServer(debuggerServerPath) === 'jlink';
}

/**
 * 获取构建生成的elf文件路径。
 * @param params 生成选项
 * @returns elf文件相对于当前工作区文件夹的相对路径，如果不在工作区文件夹则返回绝对路径
 */
function getElfFilePathForWorkspace(params: GenerateParamsInternal) {
  const { wsFolder } = params;
  const { projectType } = params.settings;
  if (projectType === 'Env') {
    const artifactPath = getConfig(wsFolder, 'generate.artifactPath', 'rt-thread');
    return normalizePathForWorkspace(wsFolder, join(wsFolder.fsPath, artifactPath));
  } else {
    const { name, artifactName } = params.buildConfig!;
    const buildAbsolutePath = join(wsFolder.fsPath, name);
    return normalizePathForWorkspace(wsFolder, join(buildAbsolutePath, `${artifactName}.elf`));
  }
}

/**
 * 更新vscode的排除文件、关联文件配置项。
 *
 * - 根据BuildConfig.excludingPaths向'files.exclude'配置项更新排除列表
 *
 * - 更新{@link ExtensionConfiguration['files.associations']}配置项：
 *
 *     - `*.h`关联为`c`语言类型， 避免每打开一个`.h`文件都被vscode自动单独添加关联设置
 *
 *     - `.cproject`、`.project` 关联为`xml`类型
 *
 *     - `makefile.init`、`makefile.defs`、`makefile.targets` 关联为`makefile`类型
 *
 * @param params 生成选项
 */
async function updateFilesAssociationsAndExclude(params: GenerateParamsInternal) {
  logger.info('updateFilesAssociationsAndExclude...');
  const { wsFolder } = params;
  const filesAssociations = getConfig(wsFolder, 'files.associations', {}, true);
  filesAssociations['*.h'] = 'c';
  filesAssociations['.cproject'] = 'xml';
  filesAssociations['.project'] = 'xml';
  filesAssociations['makefile.init'] = 'makefile';
  filesAssociations['makefile.defs'] = 'makefile';
  filesAssociations['makefile.targets'] = 'makefile';
  await updateConfig(wsFolder, 'files.associations', filesAssociations, true);

  if (params.settings.projectType === 'RT-Thread Studio') {
    const { excludingPaths } = params.buildConfig!;
    const filesExclude: Record<string, boolean> = {
      '**/.git': true,
      '**/.svn': true,
      '**/.hg': true,
      '**/CVS': true,
      '**/.DS_Store': true,
      '**/Thumbs.db': true,
    };
    excludingPaths.forEach((v) => {
      v = normalizePathForWorkspace(wsFolder, join(wsFolder.fsPath, v));
      filesExclude[v] = true;
    });
    await updateConfig(wsFolder, 'files.exclude', filesExclude, true);
  }
}

/**
 * 处理Makefile文件。
 * @param params 生成参数
 */
async function processMakefiles(params: GenerateParamsInternal) {
  logger.info('processMakefiles...');
  const { wsFolder, projcfgIni, buildConfig } = params;
  MakefileProcessor.SetProcessConfig(wsFolder, projcfgIni, buildConfig!);
  await MakefileProcessor.ProcessMakefiles();

  // jlink segger旧版本不支持解析elf文件，所以生成hex文件
  if (isJlinkDebugger(params.settings.debuggerServerPath)) {
    await MakefileProcessor.GenerateHexTarget();
  }
}

/**
 * 处理tasks.json文件。
 * @param params 生成参数
 */
async function processTasksJson(params: GenerateParamsInternal) {
  logger.info('processTasksJson...');
  const { makeMajorVersion, wsFolder, settings, exraPaths, extraVar } = params;
  const { projectType, defaultBuildTask, debuggerServerPath, cmsisPack, debuggerInterface, chipName } = settings;

  let buildCommand = 'make';
  let buildArgs = ['-j16', 'all'];
  let buildCwd: string | undefined = `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.makeBaseDirectory}`;
  let cleanArgs = ['-j16', 'clean'];
  if (makeMajorVersion && makeMajorVersion >= 4) {
    buildArgs.push('--output-sync=target');
  }
  if (projectType === 'Env') {
    buildCommand = 'scons';
    buildArgs = ['-j16'];
    cleanArgs = ['-c'];
    buildCwd = undefined;
  }

  const envPaths = [
    ...exraPaths,
    `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.makeToolPath}`,
    `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.toolchainPath}`,
    '${env:PATH}',
  ];

  const taskJson: TasksJson = {
    version: '2.0.0',
    tasks: [
      {
        label: TASKS.BUILD.label,
        detail: TASKS.BUILD.detail,
        type: 'shell',
        command: buildCommand,
        args: buildArgs,
        options: {
          cwd: buildCwd,
          env: {
            PATH: calculateEnvPathString(envPaths, ':'),
            ...extraVar,
          },
        },
        windows: {
          command: 'cmd.exe',
          args: [
            '/c',
            projectType === 'Env'
              ? ['chcp', '437', '&&', buildCommand, ...buildArgs].join(' ')
              : [buildCommand, ...buildArgs].join(' '),
          ],
          options: {
            env: {
              PATH: calculateEnvPathString(envPaths, ';'),
              ...extraVar,
            },
          },
        },
        // FIXME: 链接的问题匹配器可能不能匹配到错误信息
        problemMatcher: [GCC_COMPILE_PROBLEM_MATCHER_NAME, GCC_LINK_PROBLEM_MATCHER_NAME],
        group: {
          kind: 'build',
          isDefault: defaultBuildTask === TASKS.BUILD.label,
        },
      },
      {
        label: TASKS.BUILD_AND_DOWNLOAD.label,
        detail: TASKS.BUILD_AND_DOWNLOAD.detail,
        dependsOn: [TASKS.BUILD.label, TASKS.DOWNLOAD.label],
        dependsOrder: 'sequence',
        group: {
          kind: 'build',
          isDefault: defaultBuildTask === TASKS.BUILD_AND_DOWNLOAD.label,
        },
        problemMatcher: [],
      },
      {
        label: TASKS.CLEAN.label,
        detail: TASKS.CLEAN.detail,
        type: 'shell',
        command: buildCommand,
        args: cleanArgs,
        options: {
          cwd: buildCwd,
          env: {
            PATH: calculateEnvPathString(envPaths, ':'),
            ...extraVar,
          },
        },
        windows: {
          command: 'cmd.exe',
          args: [
            '/c',
            projectType === 'Env'
              ? ['chcp', '437', '&&', buildCommand, ...cleanArgs].join(' ')
              : [buildCommand, ...buildArgs].join(' '),
          ],
          options: {
            env: {
              PATH: calculateEnvPathString(envPaths, ';'),
              ...extraVar,
            },
          },
        },
        problemMatcher: [],
      },
      {
        label: TASKS.REBUILD.label,
        detail: TASKS.REBUILD.detail,
        dependsOn: [TASKS.CLEAN.label, TASKS.BUILD.label],
        dependsOrder: 'sequence',
        group: {
          kind: 'build',
          isDefault: defaultBuildTask === TASKS.REBUILD.label,
        },
        problemMatcher: [],
      },
    ],
  };
  if (projectType === 'Env') {
    const pkgsCommand = 'pkgs';
    const pkgsArgs = ['--update'];
    taskJson.tasks.push({
      label: TASKS.PKGS_UPDATE.label,
      detail: TASKS.PKGS_UPDATE.detail,
      type: 'shell',
      command: pkgsCommand,
      args: cleanArgs,
      options: {
        cwd: buildCwd,
        env: {
          PATH: calculateEnvPathString(envPaths, ':'),
          ...extraVar,
        },
      },
      windows: {
        command: 'cmd.exe',
        args: ['/c', ['chcp', '437', '&&', pkgsCommand, ...pkgsArgs].join(' ')],
        options: {
          env: {
            PATH: calculateEnvPathString(envPaths, ';'),
            ...extraVar,
          },
        },
      },
      problemMatcher: [],
    });
  }

  const debuggerServer = getDebugServer(debuggerServerPath);
  if (debuggerServer) {
    let downloadArgs;
    if (debuggerServer === 'openocd') {
      downloadArgs = [
        '-f',
        openocdConfigFilePath,
        '-c',
        `program ${getElfFilePathForWorkspace(params)} verify reset exit`,
      ];
    } else if (isJlinkDebugger(debuggerServerPath)) {
      // jlink segger旧版本不支持解析elf格式，所以使用hex文件
      const targetHexFilePath = getElfFilePathForWorkspace(params).replace(/\.elf$/, '.hex');
      const jlinkScriptPath = '.vscode/download.jlink';
      downloadArgs = ['-CommandFile', jlinkScriptPath];
      await writeTextFile(
        vscode.Uri.joinPath(wsFolder, jlinkScriptPath),
        'ExitOnError 1\r\n' +
          `SelectInterface ${debuggerInterface}\r\n` +
          `Speed 4000\r\n` +
          `Device ${chipName}\r\n` +
          // jlink segger旧版本无法识别`Reset`，使用`R`
          'R\r\n' +
          'Halt\r\n' +
          `Loadfile ${targetHexFilePath}\r\n` +
          'R\r\n' +
          'Qc\r\n',
      );
    } else if (debuggerServer === 'pyocd') {
      downloadArgs = ['flash', getElfFilePathForWorkspace(params)];
      if (cmsisPack) {
        downloadArgs.push('--pack');
        downloadArgs.push(`\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.cmsisPack}`);
      }
      downloadArgs.push('--target');
      downloadArgs.push(`\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.chipName}`);
    }
    taskJson.tasks.push({
      label: TASKS.DOWNLOAD.label,
      detail: TASKS.DOWNLOAD.detail,
      type: 'shell',
      command: `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.debuggerServerPath}`,
      args: downloadArgs,
      problemMatcher: [],
    });
  }

  const fileUri = vscode.Uri.joinPath(wsFolder, TASKS_JSON_RELATIVE_PATH);
  if (!(await existsAsync(fileUri))) {
    await writeJsonFile(fileUri, taskJson);
  } else {
    const oldContent = await parseJsonFile<typeof taskJson>(fileUri);
    assertParam(
      isJsonObject(oldContent) && Array.isArray(oldContent.tasks),
      vscode.l10n.t('The format of "{0}" is invalid', [fileUri.fsPath]),
    );
    for (const task of taskJson.tasks) {
      oldContent.tasks = oldContent.tasks.filter((oldTask) => oldTask.label !== task.label);
      oldContent.tasks.push(task);
    }
    await writeJsonFile(fileUri, oldContent);
  }
}

/**
 * 处理launch.json文件。
 * @param params 生成参数
 */
async function processLaunchConfig(params: GenerateParamsInternal) {
  logger.info('processLaunchConfig...');
  const { wsFolder, settings, toolchainPrefix } = params;
  const { debuggerAdapter, debuggerInterface, debuggerServerPath, chipName } = settings;
  const debuggerServer = getDebugServer(debuggerServerPath);
  if (!debuggerServer) {
    return;
  }

  let serverpath = `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.debuggerServerPath}`;
  if (isJlinkDebugger(debuggerServerPath)) {
    serverpath = normalizePathForWorkspace(wsFolder, getDebuggerServerPath(debuggerServerPath));
  } else if (debuggerServer === 'openocd') {
    const openocdConfigUri = vscode.Uri.joinPath(wsFolder, openocdConfigFilePath);
    let openocdConfigContent = await readTextFile(openocdConfigUri, '');
    const debuggerLine = `source [find interface/${debuggerAdapter.toLowerCase()}.cfg]\r\n`;
    const debuggerRegex = /^source\s+\[find\s+interface\/[^\]]+\].*\r?\n/m;
    if (!debuggerRegex.test(openocdConfigContent)) {
      openocdConfigContent += debuggerLine;
    } else {
      openocdConfigContent = openocdConfigContent.replace(debuggerRegex, debuggerLine);
    }

    let transportLine;
    const transportLineRegex = /^transport\s+select\s+\S+.*\r?\n/m;
    if (debuggerAdapter === 'STLink') {
      transportLine = `transport select hla_${debuggerInterface.toLowerCase()}\r\n`;
    } else {
      transportLine = `transport select ${debuggerInterface.toLowerCase()}\r\n`;
    }
    if (!transportLineRegex.test(openocdConfigContent)) {
      openocdConfigContent += transportLine;
    } else {
      openocdConfigContent = openocdConfigContent.replace(transportLineRegex, transportLine);
    }

    let chipLine = '';
    const chipRegex = /^source\s+\[find\s+target\/[^\]]+\].*\r?\n/m;
    if (chipName.startsWith('STM32')) {
      chipLine = `source [find target/${chipName.substring(0, 7).toLowerCase()}x.cfg]\r\n`;
      if (!chipRegex.test(openocdConfigContent)) {
        openocdConfigContent += chipLine;
      } else {
        openocdConfigContent = openocdConfigContent.replace(chipRegex, chipLine);
      }
    } else {
      if (!chipRegex.test(openocdConfigContent)) {
        chipLine = `source [find target/${chipName.toLowerCase()}.cfg]\r\n`;
        vscode.window.showWarningMessage(
          vscode.l10n.t(
            'This chip is not supported at present, please manually configure .vsocde/xxx.cfg file to support download or debug.',
          ),
        );
      }
    }
    writeTextFile(openocdConfigUri, openocdConfigContent);
  }

  let name;
  if (settings.projectType === 'RT-Thread Studio') {
    name = params.buildConfig!.name;
  } else {
    const artifactPath = getConfig(wsFolder, 'generate.artifactPath', 'rt-thread.elf');
    name = basename(artifactPath, extname(artifactPath));
  }
  const launchJsonUri = vscode.Uri.joinPath(wsFolder, '.vscode/launch.json');
  let launchJson: {
    version: string;
    configurations: Array<
      Record<string, unknown> & {
        name: string;
      }
    >;
  } = {
    version: '0.2.0',
    configurations: [],
  };
  try {
    launchJson = await parseJsonFile(launchJsonUri);
  } catch (error) {
    logger.error(error);
  }
  logger.debug('old launchJson:', launchJson);
  assertParam(
    isJsonObject(launchJson) && Array.isArray(launchJson.configurations),
    vscode.l10n.t('The format of "{0}" is invalid', [launchJsonUri.fsPath]),
  );
  launchJson.configurations = launchJson.configurations.filter((v) => v.name !== name);
  launchJson.configurations.push({
    name,
    cwd: '${workspaceFolder}',
    armToolchainPath: `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.toolchainPath}`,
    toolchainPrefix: toolchainPrefix.replace(/-$/, ''),
    executable: getElfFilePathForWorkspace(params),
    request: 'launch',
    type: 'cortex-debug',
    device: chipName,
    runToEntryPoint: 'main',
    servertype: debuggerServer,
    serverpath,
    configFiles: [normalizePathForWorkspace(wsFolder, join(wsFolder.fsPath, openocdConfigFilePath))],
    deviceName: chipName,
    interface: debuggerInterface.toLowerCase(),
    targetId: chipName,
    cmsisPack: `\${config:${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}.cmsisPack}`,
    preLaunchTask: '${defaultBuildTask}',
  });
  writeJsonFile(launchJsonUri, launchJson);
}

/**
 * 更新集成终端的环境变量设置项`terminal.integrated.env`和RT-Thread Env变量。
 *
 * @param params 生成参数
 */
async function updateTerminalIntegratedEnv(params: GenerateParamsInternal) {
  const { wsFolder, settings, exraPaths, extraVar } = params;
  const { projectType, envPath, rttDir, compilerPath, customExtraPathVar, customExtraVars } = settings;

  const envPathParsed = parsePath(envPath);
  const terminalIntegratedEnvLinux = getConfig(wsFolder, 'terminal.integrated.env.linux', {}, true);
  const terminalIntegratedEnvOsx = getConfig(wsFolder, 'terminal.integrated.env.osx', {}, true);
  const terminalIntegratedEnvWindows = getConfig(wsFolder, 'terminal.integrated.env.windows', {}, true);

  function normalizeEnvSubPath(p: string) {
    p = convertPathToUnixLike(p);
    // 防止环境变量被解析
    if (p.startsWith(convertPathToUnixLike(envPathParsed))) {
      p = envPath + p.slice(envPathParsed.length);
    }
    return p;
  }

  if (projectType === 'Env') {
    const envPathOld = getConfig(wsFolder, 'generate.envPath', '');
    extraVar['ENV_DIR'] = convertPathToUnixLike(envPath);
    extraVar['ENV_ROOT'] = convertPathToUnixLike(envPath);
    extraVar['RTT_DIR'] = normalizePathForWorkspace(wsFolder, rttDir);
    extraVar['RTT_ROOT'] = normalizePathForWorkspace(wsFolder, rttDir);
    extraVar['BSP_DIR'] = '.';
    extraVar['BSP_ROOT'] = '.';
    exraPaths.push(convertPathToUnixLike(join(envPath, 'tools', 'bin')));

    let pythonExePath;
    let pythonDir;
    const venvDir = join(envPathParsed, '.venv');
    if (await existsAsync(venvDir)) {
      const envDirNormalized = normalizeEnvSubPath(venvDir);
      exraPaths.push(convertPathToUnixLike(join(envDirNormalized, 'Scripts')));
      extraVar['VENV'] = envDirNormalized;
      extraVar['VIRTUAL_ENV'] = envDirNormalized;
      pythonExePath = convertPathToUnixLike(join(venvDir, 'Scripts', 'python'));
      pythonDir = normalizeEnvSubPath(dirnameOrEmpty(pythonExePath));
      extraVar['PYTHONHOME'] = undefined;
      extraVar['PYTHONPATH'] = undefined;
    } else {
      extraVar['VENV'] = undefined;
      extraVar['VIRTUAL_ENV'] = undefined;
      const pythonUris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(vscode.Uri.file(envPathParsed), 'tools/*/{python.exe,python}'),
      );
      assertParam(pythonUris.length > 0, vscode.l10n.t('The path "{0}" does not exists', ['python']));
      // 优先使用Python27而不是Python27_32
      pythonExePath = sortUris(pythonUris, false)[0].fsPath;
      pythonDir = normalizeEnvSubPath(dirnameOrEmpty(pythonExePath));
      extraVar['PYTHONHOME'] = pythonDir;
      extraVar['PYTHONPATH'] = pythonDir;
    }
    exraPaths.push(pythonDir);
    exraPaths.push(convertPathToUnixLike(join(pythonDir, 'Scripts')));
    extraVar['PYTHON'] = normalizeEnvSubPath(pythonExePath);
    extraVar['SCONS'] = convertPathToUnixLike(join(pythonDir, 'Scripts'));

    const execDir = normalizeEnvSubPath(dirnameOrEmpty(compilerPath));
    if (execDir) {
      exraPaths.push(execDir);
      extraVar['RTT_EXEC_PATH'] = convertPathToUnixLike(execDir);
    }

    const gitUris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(vscode.Uri.file(envPathParsed), 'tools/*/cmd/{git.exe,git}'),
    );
    for (const uri of sortUris(gitUris, false)) {
      exraPaths.push(normalizeEnvSubPath(dirnameOrEmpty(uri.fsPath)));
    }

    extraVar['PKGS_DIR'] = convertPathToUnixLike(join(envPath, 'packages'));
    extraVar['PKGS_ROOT'] = convertPathToUnixLike(join(envPath, 'packages'));

    await updateConfig(
      wsFolder,
      'terminal.integrated.profiles.windows',
      {
        'RT-Thread Env': {
          path: 'cmd.exe',
          args: ['/K', 'chcp 437'],
        },
      },
      true,
    );

    if (envPathOld !== envPath) {
      envRootChangeEmitter.fire();
    }
  }

  params.extraVar = { ...extraVar, ...customExtraVars };
  params.exraPaths = [...customExtraPathVar, ...exraPaths];
  await updateConfig(
    wsFolder,
    'terminal.integrated.env.linux',
    {
      ...terminalIntegratedEnvLinux,
      ...params.extraVar,
      PATH: calculateEnvPathString([...params.exraPaths, '${env:PATH}'], ':'),
    },
    true,
  );
  await updateConfig(
    wsFolder,
    'terminal.integrated.env.osx',
    {
      ...terminalIntegratedEnvOsx,
      ...params.extraVar,
      PATH: calculateEnvPathString([...params.exraPaths, '${env:PATH}'], ':'),
    },
    true,
  );
  await updateConfig(
    wsFolder,
    'terminal.integrated.env.windows',
    {
      ...terminalIntegratedEnvWindows,
      ...params.extraVar,
      PATH: calculateEnvPathString([...params.exraPaths, '${env:PATH}'], ';'),
    },
    true,
  );
}

/**
 * 处理点击webview面板的生成按钮，开始生成项目配置文件。
 *
 * 1. 更新vscode文件关联与排除{@link updateFilesAssociationsAndExclude}。
 *
 * 2. 处理选择的构建配置的makefile文件{@link processMakefiles}，编译提示。
 *
 * 3. 更新C/C++扩展的配置{@link processCCppPropertiesConfig}。
 *
 * 4. 更新任务配置{@link processTasksConfig}。
 *
 * 5. 对于arm{@link processLaunchConfig}。
 *
 * 5. 保存本扩展的配置。
 *
 * 6. 如果成功成功，将关闭webview面板。
 *
 * @param params 生成参数
 * @returns 成功生成配置并关闭webview面板的Promise
 * @throws 出现异常时抛出继承自{@link Error}的错误
 */
async function startGenerate(params: GenerateParamsInternal) {
  const { wsFolder, settings, toolchainPrefix } = params;
  settings.makeToolPath = convertPathToUnixLike(settings.makeToolPath);
  settings.studioInstallPath = convertPathToUnixLike(settings.studioInstallPath);
  settings.compilerPath = convertPathToUnixLike(settings.compilerPath);
  settings.debuggerServerPath = convertPathToUnixLike(settings.debuggerServerPath);
  settings.cmsisPack = convertPathToUnixLike(settings.cmsisPack);
  const vscodeFolder = vscode.Uri.joinPath(wsFolder, '.vscode');
  if (!(await existsAsync(vscodeFolder))) {
    await vscode.workspace.fs.createDirectory(vscodeFolder);
  }

  await updateTerminalIntegratedEnv(params);

  await updateFilesAssociationsAndExclude(params);

  if (settings.projectType === 'RT-Thread Studio') {
    await processCCppPropertiesConfig(wsFolder, settings.compilerPath, params.buildConfig!);
    await processMakefiles(params);
  }

  await processTasksJson(params);

  if (toolchainPrefix === 'arm-none-eabi-') {
    await processLaunchConfig(params);
  }

  // 保存配置
  const { compilerPath } = settings;
  const { buildConfigName } = settings;
  settings.makeBaseDirectory = `\${workspaceFolder}/${buildConfigName}`;
  settings.toolchainPath = dirnameOrEmpty(compilerPath);
  if (settings.cmsisPack && isAbsolutePath(settings.cmsisPack)) {
    settings.cmsisPack = normalizePathForWorkspace(wsFolder, settings.cmsisPack);
  }
  // 只在配置发生变化才更新，以复用工作区或用户域或默认值
  const lastSettings = getLastGenerateSettings(wsFolder);
  for (const key in settings) {
    const section = `${CONFIG_GROUP.GENERATE}.${key}` as keyof ExtensionGenerateSettings;
    const value = settings[key as keyof GenerateSettings];
    if (!isEqual(value, lastSettings[key as keyof GenerateSettings])) {
      await updateConfig(wsFolder, section, value);
    }
  }

  // 等待webview接收结果并处理
  setTimeout(() => {
    webviewPanel?.dispose();
  }, 100);
}

/**
 * 校验表单项，如果校验时抛出错误或警告则应答webview。
 *
 * 如果fn的返回值类型不为true且未抛出异常，则校验结果由fn负责发送应答。
 *
 * @param msg webview发送过来的消息
 * @param fn 校验函数
 */
async function withFormitemValidate(msg: WebviewToExtensionData, fn: () => Promise<true | void>) {
  try {
    const result = await fn();
    if (result === true) {
      const message = {
        command: msg.command,
        params: {
          validateResult: {
            result,
          },
        },
      };
      webviewPanel?.postMessage(message as ExtensionToWebviewDatas);
    }
  } catch (error) {
    logger.error(error);
    const validateResult: TdesignCustomValidateResult = {
      result: false,
      message: getErrorMessage(error),
      type: 'error',
    };
    if (error instanceof TdesignValidateError) {
      validateResult.type = error.type;
    }
    const message = {
      command: msg.command,
      params: { validateResult },
    };
    webviewPanel?.postMessage(message as ExtensionToWebviewDatas);
  }
}

/**
 * 检测指定的路径是否有效：
 *
 * - 可以是绝对路径
 *
 * - 可以是用户主目录下的，例如`${userHome}/.env`
 *
 * - 可以包含环境变量
 *
 * - 可以是工作区文件夹中的相对路径
 *
 * - 可以省略`.exe`后缀名
 *
 * @param p 路径
 * @param wsFolder 工作区文件夹
 * @returns
 */
async function isPathExists(p: string, wsFolder: vscode.Uri) {
  p = parsePath(p);

  if (isAbsolutePath(p)) {
    return (await existsAsync(p)) || (await existsAsync(`${p}.exe`));
  }

  if (await existsAsync(join(wsFolder.fsPath, p))) {
    return true;
  }
  if (await existsAsync(join(wsFolder.fsPath, `${p}.exe`))) {
    return true;
  }

  const envPaths = (process.env.PATH || '').split(delimiter);
  for (const envPath of envPaths) {
    if (await existsAsync(join(envPath, p))) {
      return true;
    }
    if (await existsAsync(join(envPath, `${p}.exe`))) {
      return true;
    }
  }

  return false;
}

/**
 * 排序Uri
 * @param uris 文件Uri列表
 * @param isAsc 是否升序
 * @returns 排序后的文件Uri列表
 */
function sortUris(uris: vscode.Uri[], isAsc = true) {
  if (isAsc) {
    return uris.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
  }
  return uris.sort((a, b) => b.fsPath.localeCompare(a.fsPath));
}

/**
 * 处理webview发送给扩展的消息。
 *
 * @param wsFolder 工作区文件夹
 * @param msg webview发送过来的消息
 */
async function handleWebviewMessage(wsFolder: vscode.Uri, msg: WebviewToExtensionData, buildConfigs: BuildConfig[]) {
  switch (msg.command) {
    case 'requestInitialValues': {
      const lastGenerateConfig = getLastGenerateSettings(wsFolder);
      logger.debug('lastGenerateConfig:', lastGenerateConfig);
      const projcfgIni = await parseProjcfgIni(wsFolder);
      const hardwareAdapter = projcfgIni.hardwareAdapter;
      let projcfgIniInfoDebuggerAdapter: GenerateSettings['debuggerAdapter'] = 'JLink';
      if (hardwareAdapter) {
        switch (hardwareAdapter.toLowerCase()) {
          case 'st-link':
          case 'stlink':
            projcfgIniInfoDebuggerAdapter = 'STLink';
            break;

          case 'j-link':
          case 'jlink':
            projcfgIniInfoDebuggerAdapter = 'JLink';
            break;

          case 'cmsis-dap':
            projcfgIniInfoDebuggerAdapter = 'CMSIS-DAP';
            break;

          default:
            break;
        }
      }

      // 从环境变量中获取可用的各种GCC编译器
      const compilerPaths = new Set<string>();
      const matchPaths = await getfsPathsIndirs(
        (process.env.PATH || '').split(delimiter),
        compilerFileNames.concat(compilerFileNames.map((name) => `${name}.exe`)),
      );
      for (const path of matchPaths) {
        compilerPaths.add(convertPathToUnixLike(path));
      }
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      postMessageToWebview({
        command: msg.command,
        params: {
          settings: {
            ...lastGenerateConfig,
            debuggerAdapter: lastGenerateConfig.debuggerAdapter || projcfgIniInfoDebuggerAdapter,
            chipName: lastGenerateConfig.chipName || projcfgIni.chipName || '',
          },
          workspaceFolderPicked: workspaceFolders.length >= 2 ? wsFolder.fsPath : undefined,
          compilerPaths: Array.from(compilerPaths),
          makeToolPaths: [],
          debuggerServerPaths: [],
          cmsisPackPaths: [],
          cprojectBuildConfigs: buildConfigs,
        },
      });
      break;
    }

    case 'selectFile': {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
      });
      logger.info(`selectedFile uri: ${uri}`);
      const fsPath = uri?.[0].fsPath;
      assertParam(fsPath, vscode.l10n.t('Not selected'));
      postMessageToWebview({
        command: msg.command,
        params: {
          filePath: convertPathToUnixLike(fsPath),
        },
      });
      break;
    }

    case 'selectFolder': {
      const uri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
      });
      logger.info(`selectedFolder uri: ${uri}`);
      const fsPath = uri?.[0].fsPath;
      assertParam(fsPath, vscode.l10n.t('Not selected'));
      postMessageToWebview({
        command: msg.command,
        params: {
          folderPath: fsPath,
        },
      });
      break;
    }

    case 'validatePathExists': {
      const { path } = msg.params;
      withFormitemValidate(msg, async () => {
        if (!(await isPathExists(path, wsFolder))) {
          const message = vscode.l10n.t('The path "{0}" does not exists', [path]);
          throw new TdesignValidateError(message, 'error');
        }
        return true;
      });
      break;
    }

    case 'validateStudioInstallPath': {
      const { folder } = msg.params;
      let makeToolPath;
      const compilerPaths: string[] = [];
      const debuggerServerPaths: string[] = [];
      const cmsisPackPaths: string[] = [];
      const validateResult: TdesignCustomValidateResult = {
        result: false,
        message: '',
      };
      const folderUri = vscode.Uri.file(folder);
      if (!(await existsAsync(folderUri))) {
        validateResult.message = vscode.l10n.t('The path "{0}" does not exists', [folder]);
        validateResult.type = 'error';
      } else {
        const compilerPathsPromise = vscode.workspace.findFiles(
          new vscode.RelativePattern(folderUri, '{platform,repo}/**/*-gcc.exe'),
        );
        const debuggerServersPromise = vscode.workspace.findFiles(
          new vscode.RelativePattern(
            vscode.Uri.joinPath(folderUri, 'repo/Extract/Debugger_Support_Packages'),
            '**/{pyocd.exe,JLink.exe,openocd.exe}',
          ),
        );
        const makePathUriPromise = vscode.workspace.findFiles(
          new vscode.RelativePattern(
            vscode.Uri.joinPath(folderUri, 'platform/env_released/env/tools/BuildTools'),
            '*/bin/make.exe',
          ),
        );
        const cmsisPacksUriPromise = vscode.workspace.findFiles(
          new vscode.RelativePattern(
            vscode.Uri.joinPath(folderUri, 'repo/Extract/Debugger_Support_Packages/RealThread/PyOCD'),
            '*/packs/*.pack',
          ),
        );
        const [compilerPathsUri, debuggerServersUri, makePathUris, cmsisPacksUri] = await Promise.all([
          compilerPathsPromise,
          debuggerServersPromise,
          makePathUriPromise,
          cmsisPacksUriPromise,
        ]);
        for (const uri of sortUris(compilerPathsUri, true)) {
          compilerPaths.push(removeExeSuffix(convertPathToUnixLike(uri.fsPath)));
        }
        for (const uri of sortUris(makePathUris, false)) {
          makeToolPath = convertPathToUnixLike(dirnameOrEmpty(uri.fsPath));
        }
        for (const uri of sortUris(cmsisPacksUri, false)) {
          cmsisPackPaths.push(convertPathToUnixLike(uri.fsPath));
        }
        for (const uri of sortUris(debuggerServersUri, false)) {
          debuggerServerPaths.push(removeExeSuffix(convertPathToUnixLike(uri.fsPath)));
        }
        validateResult.result = true;
      }
      postMessageToWebview({
        command: msg.command,
        params: {
          validateResult,
          makeToolPath,
          compilerPaths,
          debuggerServerPaths,
          cmsisPackPaths,
        },
      });
      break;
    }

    case 'validateCompilerPath': {
      const validateResult: TdesignCustomValidateResult = {
        result: false,
        type: 'error',
        message: '',
      };
      let toolchainPrefix: string | undefined = undefined;
      const { path } = msg.params;
      const compilerPath = parsePath(path);
      logger.info('compilerPath after extract env:', compilerPath);
      try {
        const { stdout, stderr } = await spawnPromise(compilerPath, ['-v'], { timeout: 5000 });
        const stdText = stdout + stderr;
        const versionMatch = stdText.match(/^gcc version (\d+\.\d+\.\d+)/m);
        assertParam(versionMatch, vscode.l10n.t('Not Found {0} in {1}', ['gcc version', 'gcc -v']));
        logger.info('gcc version:', versionMatch[1]);
        validateResult.result = true;
        const targetMatch = stdText.match(/^Target: (.+)/m);
        assertParam(targetMatch, vscode.l10n.t('Not Found {0} in {1}', ['Target', 'gcc -v']));
        toolchainPrefix = basename(targetMatch[1]) + '-';
        logger.info('toolchainPrefix:', toolchainPrefix);
        if (toolchainPrefix === 'arm-none-eabi-') {
          const gdbPath = join(dirnameOrEmpty(compilerPath), toolchainPrefix + 'gdb');
          try {
            const { stdout, stderr } = await spawnPromise(gdbPath, ['-v']);
            const str = stdout + stderr;
            const match = str.match(/^GNU gdb.*?\s(\d+)\.(\d+)[^\r\n]*/m);
            assertParam(match);
            const gdbMajorVersion = parseInt(match[1]);
            logger.info('gdbMajorVersion:', gdbMajorVersion);
            if (gdbMajorVersion < 9) {
              const message = vscode.l10n.t(
                'Cortex-Debug requires GDB 9 +, the toolchain of your choice has a GDB version of {0}. This will prevent you from debugging your program.',
                [`${gdbMajorVersion}.${match[2]}`],
              );
              validateResult.result = false;
              validateResult.message = message;
              validateResult.type = 'warning';
              logger.warn(message);
            }
          } catch (error) {
            logger.error(error);
            const message = vscode.l10n.t(
              'Calling "{0}" to get the version of gdb failed, which prevents you from debugging the program using the debugger.',
              [`${gdbPath} -v`],
            );
            validateResult.result = false;
            validateResult.message = message;
            validateResult.type = 'warning';
          }
        }
      } catch (error) {
        logger.error(error);
        validateResult.message = vscode.l10n.t('Execute "{0} -v" to get the GCC version fail', [compilerPath]);
        validateResult.type = 'error';
      }

      postMessageToWebview({
        command: msg.command,
        params: {
          validateResult,
          toolchainPrefix,
        },
      });
      break;
    }

    case 'validateMakeToolPath': {
      const { path } = msg.params;
      let makeMajorVersion;
      const getMajorVersion = (str: string) => {
        const match = str.match(/^GNU Make (\d+)\.(\d+)/m);
        if (match) {
          return parseInt(match[1]);
        }
        return -1;
      };
      withFormitemValidate(msg, async () => {
        if (!path) {
          try {
            const std = await spawnPromise('make', ['-v'], { timeout: 5000 });
            makeMajorVersion = getMajorVersion(std.stdout + std.stderr);
            assertParam(makeMajorVersion >= 0, '');
          } catch (error) {
            logger.error(error);
            const message = vscode.l10n.t(
              '"make" is not in the environment variable; the "Make Tool Path" should be filled in.',
            );
            throw new TdesignValidateError(message, 'warning');
          }
        } else {
          const makePath = `${parsePath(path)}/make`;
          try {
            const std = await spawnPromise(makePath, ['-v'], { timeout: 5000 });
            makeMajorVersion = getMajorVersion(std.stdout + std.stderr);
            assertParam(makeMajorVersion >= 0);
          } catch (error) {
            logger.error(error);
            const message = vscode.l10n.t('Failed to get the version of "{0}"', [makePath]);
            throw new TdesignValidateError(message, 'error');
          }
        }
        postMessageToWebview({
          command: msg.command,
          params: {
            validateResult: { result: true, message: '' },
            makeMajorVersion,
          },
        });
      });
      break;
    }

    case 'validateEnvPath': {
      const { path } = msg.params;
      withFormitemValidate(msg, async () => {
        assertParam(await isPathExists(path, wsFolder), vscode.l10n.t('The path "{0}" does not exists', [path]));
        const envToolPath = join(path, 'tools');
        assertParam(
          await isPathExists(envToolPath, wsFolder),
          vscode.l10n.t('The path "{0}" does not exists', [envToolPath]),
        );
        const folderUri = vscode.Uri.file(path);
        const uris = await vscode.workspace.findFiles(
          new vscode.RelativePattern(
            folderUri,
            'tools/gnu_gcc/arm_gcc/mingw/bin/{arm-none-eabi-gcc.exe,arm-none-eabi-gcc}',
          ),
        );
        postMessageToWebview({
          command: msg.command,
          params: {
            validateResult: { result: true, message: '' },
            compilerPaths: uris.map((uri) => removeExeSuffix(convertPathToUnixLike(uri.fsPath))),
          },
        });
      });
      break;
    }

    case 'validateRttDir': {
      const { path } = msg.params;
      const parsedPath = parsePath(path);
      withFormitemValidate(msg, async () => {
        assertParam(await isPathExists(parsedPath, wsFolder), vscode.l10n.t('The path "{0}" does not exists', [path]));
        const kconfigPath = join(parsedPath, 'src');
        assertParam(
          await isPathExists(kconfigPath, wsFolder),
          vscode.l10n.t('The path "{0}" does not exists', [kconfigPath]),
        );
        return true;
      });
      break;
    }

    case 'validateDebuggerServer': {
      const { debuggerServerPath } = msg.params;
      withFormitemValidate(msg, async () => {
        if (!debuggerServerPath) {
          throw new TdesignValidateError(
            vscode.l10n.t('You will not be able to download or debug the program'),
            'warning',
          );
        }
        assertParam(
          await isPathExists(debuggerServerPath, wsFolder),
          vscode.l10n.t('The path "{0}" does not exists', [debuggerServerPath]),
        );
        const filePath = parsePath(debuggerServerPath);
        const debuggerServer = getDebugServer(filePath);
        if (!debuggerServer) {
          throw new TdesignValidateError(
            vscode.l10n.t('Unsupported Debugger Server: {0}', [basename(debuggerServerPath)]),
            'error',
          );
        }
        try {
          const { stdout, stderr } = await spawnPromise(filePath, ['--version'], {
            resolveWhenExitCodeNotZero: true,
          });
          const std = stdout + stderr;
          logger.debug('std:', std);
          if (debuggerServer === 'openocd') {
            assertParam(/^Open On-Chip Debugger (\d+)\.(\d+)/m.test(std), '');
          } else if (isJlinkDebugger(filePath)) {
            /*
             * jlink took about 3.1s and std is:
             * ```sh
             * SEGGER J-Link Commander V7.92 (Compiled Aug 11 2023 08:41:02)
             * DLL version V7.92, compiled Aug 11 2023 08:39:26
             *
             * Unknown command line option --version.
             * ```
             */
            assertParam(/V(\d+)\.(\d+)/i.test(std), '');
          } else if (debuggerServer === 'pyocd') {
            assertParam(/^(\d+)\.(\d+)\.(\d+)/m.test(std), '');
          }
          return true;
        } catch (error) {
          logger.error(error);
          let message = vscode.l10n.t('Failed to get the version of "{0}"', [debuggerServer]);
          if (isJlinkDebugger(debuggerServerPath)) {
            message += vscode.l10n.t('. You can go to {0} to download the latest version', [
              'https://www.segger.com/downloads/jlink',
            ]);
          }
          throw new TdesignValidateError(message, 'warning');
        }
      });
      break;
    }

    case 'generateConfig': {
      const { doGenerateParams: params } = msg.params;
      const { buildConfigName } = params.settings;
      const projcfgIni = await parseProjcfgIni(wsFolder);
      const buildConfig = buildConfigs.find((v) => v.name === buildConfigName);
      if (params.settings.projectType === 'RT-Thread Studio') {
        assertParam(
          buildConfigName && buildConfig,
          vscode.l10n.t('Not Found {0} in {1}', [buildConfigName, '.croject']),
        );
      }
      await startGenerate({
        wsFolder,
        ...params,
        buildConfig,
        projcfgIni,
        exraPaths: [],
        extraVar: {},
      });
      postMessageToWebview({
        command: msg.command,
        params: {},
      });
      generateEmitter.fire();
      break;
    }

    default:
      if (process.env.NODE_ENV !== 'production') {
        vscode.window.showErrorMessage(`扩展进程未处理webview的消息`, { modal: true });
      }
      break;
  }
}

/**
 * 关闭原来的生成webview，然后重新打开。
 *
 * 打开之前先解析.project并检查必要的参数。
 *
 * 打开后监听webview的消息，处理并应答。
 *
 * @param wsFolder 工作区文件夹
 * @throws 检查失败时抛出{@link Error}，此时不打开新的webview
 */
async function checkAndOpenGenerateWebview(wsFolder: vscode.Uri) {
  logger.info('openGenerateWebview, workspaceFolder:', wsFolder.fsPath);
  webviewPanel?.dispose();
  const cprojectBuildConfigs = await parseBuildConfigs(wsFolder);
  vscode.commands.executeCommand('workbench.action.closePanel');
  webviewPanel = new WebviewPanel(
    `${EXTENSION_ID}-generate`,
    vscode.l10n.t('Generate project configuration files'),
    '/view/generate',
  );
  webviewPanel.onDidReceiveMessage = async (msg) => {
    await handleWebviewMessage(wsFolder, msg, cprojectBuildConfigs);
  };

  return new Promise<void>((resolve) => {
    const disposable = generateEmitter.event(() => {
      disposable.dispose();
      resolve();
    });
  });
}

/**
 * 解析选择的构建配置，不抛出出现的异常。
 * @param wsFolder 工作区文件夹
 * @returns 选择的构建配置，构建配置无效或未选择时返回`undefined`
 */
async function parseSelectedBuildConfigs(wsFolder: vscode.Uri) {
  const cprojectBuildConfigs = await parseBuildConfigs(wsFolder);
  const buildConfigName = getConfig(wsFolder, 'generate.buildConfigName', '');
  const buildConfig = cprojectBuildConfigs.find((v) => v.name === buildConfigName);
  if (!buildConfigName || !buildConfig || !buildConfig.toolchainPrefix) {
    return undefined;
  }
  return buildConfig;
}

export {
  checkAndOpenGenerateWebview,
  parseProjcfgIni,
  parseSelectedBuildConfigs,
  disposeWebviewPanel,
  onDidEnvRootChange,
};
