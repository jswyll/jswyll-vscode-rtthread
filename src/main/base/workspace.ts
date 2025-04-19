import * as vscode from 'vscode';
import { delimiter, join, relative, sep } from 'path';
import { ExtensionSettings, VscodeSettings } from './type';
import { EXTENSION_ID } from '../../common/constants';
import { toUnixPath, isAbsolutePath, windowsAbsolutePathPattern } from '../../common/platform';
import { Logger } from './logger';
import { disposeWebviewPanel } from '../project/generate';
import { debounce } from 'lodash';
import { homedir } from 'os';
import { existsAsync } from './fs';
import { getErrorMessage } from '../../common/error';

/**
 * 全局状态
 */
interface GlobalState {
  /**
   * 上一次的扩展的版本号
   */
  lastVersion: string | undefined;
}

/**
 * 工作区状态
 */
interface WorkspaceState {
  /**
   * 多根工作区情况下，选择的工作区文件夹。非多根工作区情况下是未定义的。
   */
  workspaceFolderPicked: string;
}

/**
 * 日志记录器
 */
const logger = new Logger('main/base/workspace');

/**
 * 本扩展用到的vscode设置的键
 */
export const vscodeSettingsKeys: Array<keyof VscodeSettings> = [
  'files.exclude',
  'files.associations',
  'terminal.integrated.env.windows',
  'terminal.integrated.env.osx',
  'terminal.integrated.env.linux',
  'terminal.integrated.profiles.windows',
  'terminal.integrated.profiles.osx',
  'terminal.integrated.profiles.linux',
  'terminal.integrated.defaultProfile.osx',
] as const;

/**
 * 配置是否由扩展更改的
 */
let isConfigUpdateByExtension = false;

/**
 * 切换为不是扩展更改的配置。
 */
const unsetIsConfigUpdateByExtension = debounce(() => {
  isConfigUpdateByExtension = false;
}, 3000);

/**
 * 扩展的上下文
 */
let context: vscode.ExtensionContext;

/**
 * 切换工作区文件夹的事件发射器，仅当切换后和切换前不相等才发送事件。
 *
 * 事件数据为切换后的工作区文件夹
 */
export const workspaceFolderChangeEmitter = new vscode.EventEmitter<vscode.WorkspaceFolder>();

/**
 * 订阅工作区文件夹切换的事件。
 */
export const onWorkspaceFolderChange = workspaceFolderChangeEmitter.event;

/**
 * 设置扩展的上下文。
 * @param newContext 上下文
 */
export function setExtensionContext(newContext: vscode.ExtensionContext) {
  context = newContext;
}

/**
 * 获取扩展的上下文。
 */
export function getExtensionContext() {
  return context;
}

/**
 * 弹出工作区文件夹选择器。
 * @returns 选择的工作区文件夹
 */
export async function pickWorkspaceFolder() {
  const oldFsPath = getWorkspaceState('workspaceFolderPicked', '');
  const { workspaceFolders } = vscode.workspace;
  if (!workspaceFolders) {
    throw new Error(vscode.l10n.t('There is no workspace folder open for the current window'));
  }
  const options = workspaceFolders.map((v, index) => {
    return {
      label: v.name,
      description: oldFsPath === v.uri.fsPath ? vscode.l10n.t('last used') : '',
      detail: v.uri.fsPath,
      index,
    };
  });
  const option = await vscode.window.showQuickPick(options, {
    placeHolder: vscode.l10n.t('Choose a workspace folder'),
  });
  if (!option) {
    throw new Error(vscode.l10n.t('No workspace folder selected for use'));
  }
  const { fsPath } = workspaceFolders[option.index].uri;
  if (workspaceFolders[option.index].uri.fsPath !== oldFsPath) {
    logger.info(`change workspaceFolder from ${oldFsPath} to ${fsPath}`);
    workspaceFolderChangeEmitter.fire(workspaceFolders[option.index]);
    disposeWebviewPanel();
  }
  updateWorkspaceState('workspaceFolderPicked', fsPath);
  return workspaceFolders[option.index];
}

/**
 * 获取使用的工作区文件夹。
 */
export async function getCurrentWorkspaceFolder() {
  const { workspaceFolders } = vscode.workspace;
  if (!workspaceFolders) {
    throw new Error(vscode.l10n.t('There is no workspace folder open for the current window'));
  }
  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }
  const fsPath = getWorkspaceState('workspaceFolderPicked', '');
  if (fsPath) {
    const workspaceFolder = workspaceFolders.find((folder) => folder.uri.fsPath === fsPath);
    if (workspaceFolder) {
      return workspaceFolder;
    }
  }
}

/**
 * 获取或选择使用的工作区文件夹。
 *
 * 如果是多根工作区且未选择过工作区文件夹则弹出选择器，否则自动选择第一个。
 *
 * @returns 选择的工作区文件夹
 */
export async function getOrPickAWorkspaceFolder() {
  const workspaceFolder = await getCurrentWorkspaceFolder();
  if (workspaceFolder) {
    return workspaceFolder;
  }

  return pickWorkspaceFolder();
}

/**
 * 获取扩展的设置。
 * @param scope 作用域
 * @param key 键
 * @param defaultValue 值不存在时，返回的默认值
 * @param allSection 指定的key是否为全局节点
 *
 * - `false` 配置项是当前扩展的节点，即`${EXTENSION_ID}.${key}`
 * - `true` 配置项是全局的节点，即`${key}`
 */
export function getConfig<T extends keyof ExtensionSettings>(
  scope: vscode.ConfigurationScope | null,
  key: T,
  defaultValue: ExtensionSettings[T],
  allSection: boolean = false,
) {
  const section = allSection ? undefined : EXTENSION_ID;
  return vscode.workspace.getConfiguration(section, scope).get(key, defaultValue);
}

/**
 * 更新扩展的设置。
 * @param scope 作用域
 * @param key 键
 * @param value 值
 * @param allSection 指定的key是否为全局节点
 *
 * - `false` 配置项是当前扩展的节点，即`${EXTENSION_ID}.${key}`
 * - `true` 配置项是全局的节点，即`${key}`
 */
export async function updateConfig<T extends keyof ExtensionSettings>(
  scope: vscode.ConfigurationScope | null,
  key: T,
  value: ExtensionSettings[T],
  allSection: boolean = false,
) {
  const section = allSection ? undefined : EXTENSION_ID;
  isConfigUpdateByExtension = true;
  await vscode.workspace.getConfiguration(section, scope).update(key, value);
  unsetIsConfigUpdateByExtension();
}

/**
 * 获取vscode的设置。
 * @param scope 作用域
 * @param key 键
 * @param defaultValue 值不存在时，返回的默认值
 */
export function getVscodeConfig<T extends keyof VscodeSettings>(
  scope: vscode.ConfigurationScope | null,
  key: T,
  defaultValue: VscodeSettings[T],
) {
  return vscode.workspace.getConfiguration(undefined, scope).get(key, defaultValue);
}

/**
 * 更新vscode的设置。
 * @param scope 作用域
 * @param key 键
 * @param value 值
 */
export async function updateVscodeConfig<T extends keyof VscodeSettings>(
  scope: vscode.ConfigurationScope | null,
  key: T,
  value: VscodeSettings[T],
) {
  await vscode.workspace.getConfiguration(undefined, scope).update(key, value);
}

/**
 * 获取是否由扩展更改的配置。
 */
export function getIsConfigUpdateByExtension() {
  return isConfigUpdateByExtension;
}

/**
 * 设置配置是否由扩展更改的
 * @param value 新的布尔值
 */
export function setIsConfigUpdateByExtension(value: boolean) {
  isConfigUpdateByExtension = value;
}

/**
 * 获取全局状态。
 * @param key 键
 * @param defaultValue 默认值
 */
export function getGlobalState<K extends keyof GlobalState>(key: K, defaultValue: GlobalState[K]) {
  return context.globalState.get(key, defaultValue);
}

/**
 * 设置全局状态。
 * @param key 键
 * @param value 值
 */
export function updateGlobalState<K extends keyof GlobalState>(key: K, value: GlobalState[K]) {
  return context.globalState.update(key, value);
}

/**
 * 获取工作区的状态。
 * @param key 键
 * @param defaultValue 默认值
 */
export function getWorkspaceState<K extends keyof WorkspaceState>(key: K, defaultValue: WorkspaceState[K]) {
  return context.workspaceState.get(key, defaultValue);
}

/**
 * 设置工作区的状态。
 * @param key 键
 * @param value 值
 */
export function updateWorkspaceState<K extends keyof WorkspaceState>(key: K, value: WorkspaceState[K]) {
  context.workspaceState.update(key, value);
}

/**
 * 将路径规范化为相对于工作区的路径。
 *
 * 如果已经是相对路径，则返回规范化后的原路径。
 *
 * 如果在同一个盘符内内则为相对路径，否则为绝对路径。
 * TODO: 对于工具，改为如果是在工作区文件夹内才转为相对路径，否则为绝对路径。
 *
 * 如果指定的路径是工作区文件夹，则返回空字符串。
 *
 * 转换结果使用{@link toUnixPath}规范化。
 *
 * @param wsFolder 工作区文件夹
 * @param fsPath 文件或文件夹的绝对路径
 * @returns 从`workspaceFolder`去到`fsPath`的路径
 */
export function normalizePathForWorkspace(wsFolder: vscode.Uri, fsPath: string) {
  if (!isAbsolutePath(fsPath)) {
    return toUnixPath(fsPath);
  }

  let absolutePathFrom = wsFolder.fsPath + sep;
  let absolutePathto = fsPath + sep;
  absolutePathFrom = absolutePathFrom.replace(windowsAbsolutePathPattern, (match0) => {
    return match0.toLowerCase();
  });
  absolutePathto = absolutePathto.replace(windowsAbsolutePathPattern, (match0) => {
    return match0.toLowerCase();
  });
  const relativePath = relative(absolutePathFrom, absolutePathto);
  return toUnixPath(relativePath);
}

/**
 * 解析路径。
 *
 * - `${env:VAR_NAME}`将被替换为环境变量的值（如果对应的环境变量存在）。
 *
 * - `${userHome}`将被替换为用户主目录。
 *
 * @param p 要解析的字符串
 * @returns 解析后的字符串
 */
export function parsePath(p: string) {
  p = p.replace(/\$\{userHome\}/g, () => {
    return homedir();
  });
  return p.replace(/\$\{env:([^}]+)\}/g, (...match) => {
    if (match[1] !== undefined) {
      const replaceText = process.env[match[1]];
      if (replaceText !== undefined) {
        return replaceText;
      }
    }
    return match[0];
  });
}

/**
 * 获取当前平台类型。
 *
 * - `windows`：Windows
 * - `osx`：MacOS
 * - `linux`：Linux
 */
export function getPlatformType() {
  if (process.platform === 'win32') {
    return 'windows';
  }
  if (process.platform === 'darwin') {
    return 'osx';
  }
  return 'linux';
}

/**
 * 判断指定的路径是否在环境变量`PATH`中。
 *
 * @param p 相对路径或命令，可以省略`.exe`后缀，例如`openocd`
 * @returns 指定的路径是否在环境变量中
 */
export async function inEnvironmentPath(p: string) {
  const platformType = getPlatformType();
  const envPaths = (process.env.PATH || '').split(delimiter);
  for (const envPath of envPaths) {
    if (await existsAsync(join(envPath, p))) {
      return true;
    }
    if (platformType === 'windows' && (await existsAsync(join(envPath, `${p}.exe`)))) {
      return true;
    }
  }
}

/**
 * 获取环境变量中指定的路径的全路径。
 *
 * @param p 路径，可以省略`.exe`后缀，例如`openocd`
 * @returns 指定的路径的所有全路径
 */
export async function getAllFullPathsInEnvironmentPath(p: string) {
  const platformType = getPlatformType();
  const envPaths = (process.env.PATH || '').split(delimiter);
  const promises: Promise<string>[] = [];
  for (const envPath of envPaths) {
    if (platformType === 'windows') {
      const fsPath = join(envPath, `${p}.exe`);
      promises.push(
        existsAsync(fsPath).then((b) => {
          if (b) {
            return toUnixPath(fsPath);
          }
          return '';
        }),
      );
    }
    const fsPath = join(envPath, p);
    promises.push(
      existsAsync(fsPath).then((b) => {
        if (b) {
          return toUnixPath(fsPath);
        }
        return '';
      }),
    );
  }
  const paths = await Promise.all(promises);
  return paths.filter((p) => !!p);
}

/**
 * 包装异步函数，如果发生错误，则弹出显示错误提示消息并记录日志。
 *
 * @param promise 异步函数
 */
export async function withErrorMessage<T = void>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (e) {
    const errmsg = vscode.l10n.t('An error occurred: ') + getErrorMessage(e);
    vscode.window.showErrorMessage(errmsg);
    logger.debug(errmsg);
    throw e;
  }
}
