import type { ExtensionToWebviewDataMap, ExtensionToWebviewData, WebviewToExtensionData } from '../../../common/type';
import { CustomEvent } from '../../../common/event';
import { onMounted, onUnmounted } from 'vue';

/**
 * 获取vscode API
 */
declare let acquireVsCodeApi: () => { postMessage: (message: WebviewToExtensionData) => void };

/**
 * Webview事件类
 */
declare class VscodeEvent {
  /**
   * 生成的结果
   */
  once<T extends keyof ExtensionToWebviewDataMap>(event: T, listener: (data: ExtensionToWebviewData<T>) => void): void;

  /**
   * 生成的结果
   */
  emit<T extends keyof ExtensionToWebviewDataMap>(event: T, data: ExtensionToWebviewData<T>): void;
}

/**
 * 页面事件
 */
const event: VscodeEvent = new CustomEvent();
/**
 * webview与扩展进程通信的vscode对象
 */
const vscode = getVsCodeApi();

/**
 * 获取vscode API
 * @returns vscode API
 */
function getVsCodeApi(): { postMessage: (message: WebviewToExtensionData) => void } | undefined {
  try {
    return acquireVsCodeApi();
  } catch {
    return undefined;
  }
}

/**
 * 处理vscode扩展发送的消息
 */
function handleWindowMessage(m: MessageEvent) {
  const { data } = m;
  event.emit(data.command, data);
}

/**
 * 暴露给webview使用的方法
 */
export function useWebview() {
  onMounted(() => window.addEventListener('message', handleWindowMessage));
  onUnmounted(() => window.removeEventListener('message', handleWindowMessage));

  return {
    /**
     * 向扩展进程发送请求并等待应答
     *
     * 扩展应答的command与请求的command一致，当errmsg的类型为字符串时表示扩展执行时发生错误的信息
     *
     * @param data 消息
     * @returns 应答数据
     */
    requestExtension<T extends keyof ExtensionToWebviewDataMap>(data: WebviewToExtensionData & { command: T }) {
      vscode?.postMessage(data);
      return new Promise<ExtensionToWebviewDataMap[T]['params']>((resolve, reject) => {
        event.once(data.command, (e) => {
          if (e.errmsg === undefined) {
            resolve(e.params);
          } else {
            reject(new Error(e.errmsg));
          }
        });
      });
    },
  };
}
