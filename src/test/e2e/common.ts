import { spawnSync } from 'child_process';
import { toUnixPath } from '../../common/platform';
import { EXTENSION_ID } from '../../common/constants';
import { resolve } from 'path';
import { menv } from '../wdio-conf';

/**
 * 本扩展的源码根目录。
 */
export const extensionDevelopmentRoot = resolve('.');

/**
 * RT-Thread项目的根目录（已转为unix风格）。
 */
export const rtthreadProjectRoot = toUnixPath(menv.MY_RTTHREAD_PROJECT_ROOT);

/**
 * 清除RT-Thread项目的所有改动并移除未跟踪的文件。
 */
export function cleanRtthreadProject() {
  spawnSync('git', ['reset', '--hard', 'HEAD'], { cwd: rtthreadProjectRoot, stdio: 'inherit' });
  spawnSync('git', ['clean', '-fdx'], { cwd: rtthreadProjectRoot, stdio: 'inherit' });
}

/**
 * vscode打开工作文件夹。
 */
export async function vscodeOpenFolder(dir: string) {
  const newWorkspaceRoot = resolve(dir);
  await browser.executeWorkbench((vscode, newRoot) => {
    const uri = vscode.Uri.file(newRoot);
    vscode.commands.executeCommand('vscode.openFolder', uri);
  }, newWorkspaceRoot);

  await browser.waitUntil(
    async () => {
      const root = await browser.executeWorkbench<string | undefined>((vscode) =>
        vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined,
      );
      return root && toUnixPath(root) === toUnixPath(dir);
    },
    { timeout: 10000 },
  );
}

/**
 * 等待本扩展被激活（显示状态栏按钮）。
 */
export async function waitExtensionActive() {
  await browser.waitUntil(
    async () => {
      const workbench = await browser.getWorkbench();
      const items = await workbench.getStatusBar().getItems();
      return items.some((v) => v.startsWith(`sign-in  Import, ${EXTENSION_ID} - `));
    },
    { timeout: 5000 },
  );
}
