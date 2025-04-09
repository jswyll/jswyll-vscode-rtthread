import { join } from 'path';
import * as vscode from 'vscode';
import { assertParam } from '../../common/assert';
import { EXTENSION_ID } from '../../common/constants';
import { isJsonObject } from '../../common/utils';
import { existsAsync, writeJsonFile, parseJsonFile } from '../base/fs';
import { normalizePathForWorkspace } from '../base/workspace';
import { BuildConfig } from '../../common/types/generate';

/**
 * C/C++配置文件
 */
export interface CCppProperties {
  /**
   * 配置组
   */
  configurations: Array<{
    /**
     * 配置标识符。 `Mac`、`Linux` 和 `Win32` 是将在这些平台上自动选择的配置的特殊标识符，但标识符可以为任何内容。
     */
    name: string;

    /**
     * 正在使用的编译器的完整路径(例如 `/usr/bin/gcc`)，以启用更准确的 IntelliSense。
     */
    compilerPath?: string;

    /**
     * 用于修改所使用的包含或定义的编译器参数，例如 `-nostdinc++`、`-m32` 等。
     */
    compilerArgs?: string[];

    /**
     * 用于 IntelliSense 的 C 语言标准的版本。注意: GNU 标准仅用于查询设置编译器以获取 GNU 定义，并且 IntelliSense 将模拟等效的 C 标准版本。
     */
    cStandard?: 'c89' | 'c99' | 'c11' | 'c17' | 'c23' | 'gnu89' | 'gnu99' | 'gnu11' | 'gnu17' | 'gnu23' | '${default}';

    /**
     * C++语言标准
     */
    cppStandard?:
      | 'c++98'
      | 'c++03'
      | 'c++11'
      | 'c++14'
      | 'c++17'
      | 'c++20'
      | 'c++23'
      | 'gnu++98'
      | 'gnu++03'
      | 'gnu++11'
      | 'gnu++14'
      | 'gnu++17'
      | 'gnu++20'
      | 'gnu++23'
      | '${default}';

    /**
     * 工作区的 `compile_commands.json` 文件的完整路径或完整路径列表。
     */
    compileCommands?: string | string[];

    /**
     * 搜索包含的标头时，IntelliSense 引擎要使用的路径列表。在这些路径上进行搜索为非递归搜索。
     * 指定 `**` 以指示递归搜索。
     */
    includePath?: string[];

    /**
     * 要使用的、映射到 MSVC、gcc 或 Clang 的平台和体系结构变体的 IntelliSense 模式。
     * 如果未设置或设置为`${default}`，则扩展将为该平台选择默认值。Windows 默认为 `windows-msvc-x64`，
     * Linux 默认为`linux-gcc-x64`，macOS 默认为 `macos-clang-x64`。仅指定 `<编译器>-<体系结构>`
     * 变体(例如 `gcc-x64`)的 IntelliSense 模式为旧模式，且会根据主机平台上的 `<平台>-<编译器>-<体系结构>`
     * 变体进行自动转换。
     */
    intelliSenseMode?: string;

    /**
     * Kconfig 系统创建的 .config 文件的路径。Kconfig 系统生成包含所有定义的文件以生成项目。
     * 使用 Kconfig 系统的项目示例包括 Linux 内核和 NuttX RTOS。
     */
    dotConfig?: string;

    /**
     * 分析文件时要使用的 IntelliSense 引擎的预处理器定义列表。(可选)使用 `=` 设置值，例如 `VERSION=1`。
     */
    defines?: string[];
  }>;
}

/**
 * 处理C/C++配置文件。
 * @param params 生成选项
 */
export async function processCCppPropertiesConfig(
  wsFolder: vscode.Uri,
  compilerPath: string,
  buildConfig: BuildConfig,
) {
  const { cDefines, cIncludePaths } = buildConfig;
  const includePathSet = new Set<string>();
  for (const cIncludePath of cIncludePaths) {
    // TODO: cIncludePath一定是相对于当前工作区文件夹的相对路径？
    const normalizePath = normalizePathForWorkspace(wsFolder, join(wsFolder.fsPath, cIncludePath));
    if (!normalizePath) {
      includePathSet.add('.');
    } else {
      includePathSet.add(normalizePath);
    }
  }

  let dotConfig: string | undefined = undefined;
  const dotConfigPath = vscode.Uri.file(join(wsFolder.fsPath, '.config'));
  if (await existsAsync(dotConfigPath)) {
    dotConfig = normalizePathForWorkspace(wsFolder, dotConfigPath.fsPath);
  }
  const cCppPropertiesJson: CCppProperties = {
    configurations: [
      {
        name: EXTENSION_ID,
        compilerPath,
        intelliSenseMode: 'gcc-arm',
        includePath: Array.from(includePathSet),
        defines: ['${default}'],
        cStandard: 'c99',
        cppStandard: 'c++11',
        dotConfig,
      },
    ],
  };
  cCppPropertiesJson.configurations[0].defines!.push(...cDefines);
  const fileUri = vscode.Uri.joinPath(wsFolder, '.vscode/c_cpp_properties.json');
  if (!(await existsAsync(fileUri))) {
    await writeJsonFile(fileUri, cCppPropertiesJson);
  } else {
    const configJson = await parseJsonFile<typeof cCppPropertiesJson>(fileUri);
    assertParam(
      isJsonObject(configJson) && Array.isArray(configJson.configurations),
      vscode.l10n.t('The format of "{0}" is invalid', [fileUri.fsPath]),
    );
    const configuration = cCppPropertiesJson.configurations[0];
    configJson.configurations = configJson.configurations.filter((v) => v.name !== configuration.name);
    configJson.configurations.unshift(configuration);
    await writeJsonFile(fileUri, configJson);
  }
}
