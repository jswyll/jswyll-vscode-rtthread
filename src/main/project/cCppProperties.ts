import { join } from 'path';
import * as vscode from 'vscode';
import { assertParam } from '../../common/assert';
import { EXTENSION_ID } from '../../common/constants';
import { isJsonObject } from '../../common/utils';
import { existsAsync, writeJsonFile, parseJsonFile } from '../base/fs';
import { normalizePathForWorkspace } from '../base/workspace';
import { BuildConfig } from '../../common/types/generate';

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
  const cCppPropertiesJson = {
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
  cCppPropertiesJson.configurations[0].defines.push(...cDefines);
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
