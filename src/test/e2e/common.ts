import { spawnSync } from 'child_process';
import { EXTENSION_ID } from '../../common/constants';
import { resolve } from 'path';
import { assertParam } from '../../common/assert';
import { isPathUnderOrEqual } from '../../common/platform';
import { AppVersion } from '../../common/version';
import { menv } from '../wdio-conf';

/**
 * 本扩展状态栏按钮的正则表达式
 */
const STATUSBAR_REGEX = {
  IMPORT: new RegExp(`^sign-in  Import, ${EXTENSION_ID} - `),
};

/**
 * 本扩展的源码根目录
 */
export const extensionDevelopmentRoot = resolve('.');

/**
 * 默认的RT-Thread项目的根目录的绝对路径
 */
export const defaultRtthreadProjectRoot = resolve(menv.MY_RTTHREAD_PROJECT_ROOT);

/**
 * 定义被测试工作区的信息
 */
export interface TestWorkspaceInfo {
  /**
   * 工作区文件夹的绝对路径
   */
  workspaceFolder: string;

  /**
   * 是否为多根工作区
   */
  isMultiRootWorkspace: boolean;

  /**
   * 是否为RT-Thread项目
   */
  isRtthreadProject: boolean;

  /**
   * RT-Thread版本，如果不是RT-Thread项目则为`NaN.NaN.NaN`
   */
  rthreadVersion: AppVersion;
}

/**
 * 清除RT-Thread项目的所有改动并移除未跟踪的文件。
 * @param cwd 工作区根目录。
 */
export function cleanRtthreadProject(cwd: string) {
  const fsPath = resolve(cwd);
  const testFsPath = resolve('test/projects');
  assertParam(isPathUnderOrEqual(testFsPath, fsPath), '为避免误操作，被测试的RT-Thread项目必须在`test/projects`目录下');
  spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd, stdio: 'inherit' });
  spawnSync('git', ['clean', '-fdx'], { cwd, stdio: 'inherit' });
}

/**
 * 获取当前打开的第一个工作区文件夹的绝对路径，如果未打开文件夹则返回`undefined`。
 */
export async function getFirstWorkspaceFolder() {
  const root = await browser.executeWorkbench<string | undefined>((vscode) =>
    vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined,
  );
  return root;
}

/**
 * 等待本扩展被激活（显示状态栏按钮）。
 */
export async function waitExtensionActive() {
  await browser.waitUntil(
    async () => {
      const workbench = await browser.getWorkbench();
      const items = await workbench.getStatusBar().getItems();
      return items.some((v) => v.includes(`, ${EXTENSION_ID} - `));
    },
    { timeout: 3000 },
  );
}

/**
 * 测试扩展激活状态。
 *
 * 1. 如果是RT-Thread项目，清除所有改动并移除未跟踪的文件。
 *
 * 2. 如果是RT-Thread项目，应在一定的时间内显示状态栏按钮。
 *
 * @param ti 被测试的工作区信息。
 */
export async function testExtensionActiveState(ti: TestWorkspaceInfo) {
  if (ti.isRtthreadProject) {
    cleanRtthreadProject(ti.workspaceFolder);
  }

  if (ti.isRtthreadProject) {
    await expect(waitExtensionActive()).resolves.not.toThrow();
  } else {
    await expect(waitExtensionActive()).rejects.toBeDefined();
  }
}

/**
 * 测试初始状态的状态栏按钮。
 * @param ti 被测试的工作区信息。
 */
export async function testInitialStatusbar(ti: TestWorkspaceInfo) {
  // TODO: 验证是否显示选择工作区文件夹按钮
  if (ti.isRtthreadProject) {
    it('应只显示“导入”按钮', async () => {
      const workbench = await browser.getWorkbench();
      const items = await workbench.getStatusBar().getItems();
      const extensionStatusbars = items.filter((v) => v.includes(`, ${EXTENSION_ID} - `));
      expect(extensionStatusbars).toHaveLength(ti.isMultiRootWorkspace ? 2 : 1);
      expect(extensionStatusbars[ti.isMultiRootWorkspace ? 1 : 0]).toMatch(STATUSBAR_REGEX.IMPORT);
    });
  }
}
