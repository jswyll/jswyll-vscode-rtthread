import * as vscode from 'vscode';
import { WebviewPanel } from '../base/webview';
import { EXTENSION_ID } from '../../common/constants';
import { AppVersion } from '../../common/version';
import { readTextFile } from '../base/fs';
import { getExtensionContext } from '../base/workspace';

/**
 * markdown文档
 */
export class MarkdownPage {
  /**
   * webview面板
   */
  private static webviewPanel: WebviewPanel | null;

  /**
   * 创建或打开面板
   * @param title 标题
   * @param markdownText markdown文本
   */
  public static CreateOrOpenPanel(title: string, markdownText: string) {
    if (this.webviewPanel && !this.webviewPanel.isDisposed) {
      this.webviewPanel?.postMessage({
        command: 'updateMarkdownText',
        params: {
          markdownText,
        },
      });
      this.webviewPanel.show();
      return;
    }
    vscode.commands.executeCommand('workbench.action.closePanel');
    this.webviewPanel = new WebviewPanel(`${EXTENSION_ID}-markdown`, title, '/view/markdown');
    this.webviewPanel.onDidReceiveMessage = async (msg) => {
      switch (msg.command) {
        case 'updateMarkdownText':
          this.webviewPanel?.postMessage({
            command: msg.command,
            params: {
              markdownText,
            },
          });
          break;

        default:
          break;
      }
    };
  }

  /**
   * 销毁
   */
  public static Dispose() {
    this.webviewPanel?.dispose();
  }
}

/**
 * 打开ChangeLog
 * @param lastVersion 升级前的版本，低于此版本的标题前会加3条水平线
 */
export async function openChangeLog(lastVersion?: AppVersion) {
  const context = getExtensionContext();
  const changelogUri = vscode.Uri.joinPath(context.extensionUri, 'changelog.md');
  let changelogText = await readTextFile(changelogUri);
  if (lastVersion) {
    const matches = changelogText.matchAll(/^#{2,3} .*?v(\d+\.\d+\.\d+)$/gm);
    let count = 0;
    for (const match of matches) {
      const v = new AppVersion(match[2]);
      if (count > 0 && v.lte(lastVersion)) {
        changelogText =
          changelogText.slice(0, match.index) + '---\r\n\r\n---\r\n\r\n---\r\n\r\n' + changelogText.slice(match.index);
        break;
      }
      count++;
    }
  }
  MarkdownPage.CreateOrOpenPanel(vscode.l10n.t('Release Notes'), changelogText);
}
