import * as vscode from 'vscode';
import { getExtensionContext } from './workspace';
import { getNonce } from '../../common/utils';
import { platform } from 'os';
import { EXTENSION_ID } from '../../common/constants';
import { ExtensionToWebviewDatas, WebviewToExtensionData } from '../../common/types/type';
import { Logger } from './logger';
import { getErrorMessage } from '../../common/error';

/**
 * 日志记录器
 */
const logger = new Logger('main/base/webview');

export class WebviewPanel {
  /**
   * 面板
   */
  public panel: vscode.WebviewPanel | null;

  /**
   * 监听器
   */
  private readonly disposable: vscode.Disposable;

  /**
   * 构造函数。
   * @param viewType 视图类型
   * @param title 标题
   * @param path 页面的路由路径
   */
  constructor(viewType: string, title: string, path: string) {
    const themeMode = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
    const context = getExtensionContext();
    this.panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out/webview')],
    });
    context.subscriptions.push(this.panel);
    this.panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'icon.png');
    const scriptPath = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'out/webview/index.js'),
    );
    const cssPath = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'out/webview/index.css'));
    const nonce = getNonce(32);
    const html = `<!DOCTYPE html>
  <html data-platform="${platform()}" lang="${vscode.env.language}" path="${path}" theme-mode="${themeMode}">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';">
      <title>${EXTENSION_ID}-vue</title>
      <link rel="stylesheet" href="${cssPath}">
    </head>
    <body>
      <div id="app"></div>
      <script nonce="${nonce}" src="${scriptPath}"></script>
    </body>
  </html>`;
    this.panel.webview.html = html;
    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      undefined,
      context.subscriptions,
    );

    this.disposable = this.panel.webview.onDidReceiveMessage(async (msg) => {
      logger.info('extension recv:', msg);
      try {
        await this.onDidReceiveMessage?.(msg);
      } catch (error) {
        // 出现未捕获的异常则应答为失败
        logger.error(error);
        const message = {
          command: msg.command,
          params: {},
          errmsg: getErrorMessage(error),
        };
        this.postMessage(message);
        throw error;
      }
    });
  }

  /**
   * 是否已销毁。
   */
  public get isDisposed() {
    return this.panel === null;
  }

  /**
   * 显示。
   */
  public show() {
    this.panel?.reveal();
  }

  /**
   * 处理收到webview发来的消息。
   *
   * 如果在调用此函数时抛出异常，则向扩展应答为失败。
   *
   * @param msg 消息
   */
  public onDidReceiveMessage?: (msg: WebviewToExtensionData) => Promise<void>;

  /**
   * 发送消息。
   * @param message 消息
   */
  public async postMessage(message: ExtensionToWebviewDatas) {
    if (!this.panel) {
      return;
    } else {
      const posted = await this.panel.webview.postMessage(message);
      if (posted) {
        logger.info('extension send', message);
      }
    }
  }

  /**
   * 销毁
   */
  public dispose() {
    this.disposable.dispose();
    this.panel?.dispose();
  }
}
