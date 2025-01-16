import { WebviewToExtensionDataMap, ExtensionToWebviewDataMap } from './vscode';

/**
 * 扩展进程向webview发送的各种消息
 */
export declare type ExtensionToWebviewDatas = {
  [K in keyof ExtensionToWebviewDataMap]: {
    /** 指令 */
    command: K;
  } & ExtensionToWebviewDataMap[K] & {
      /**
       * 错误提示语，`undefined`表示成功，如果出错则为失败原因
       */
      errmsg?: string;
    };
}[keyof ExtensionToWebviewDataMap];

/**
 * （webview向扩展请求时）扩展进程应答的具体消息
 */
export declare type ExtensionToWebviewData<T extends keyof ExtensionToWebviewDataMap> = {
  /** 指令 */
  command: T;
} & ExtensionToWebviewDataMap[T] & {
    /**
     * 错误提示语，`undefined`表示成功，如果出错则为失败原因
     */
    errmsg?: string;
  };

/**
 * webview向扩展进程的发送消息
 */
export declare type WebviewToExtensionData = {
  [K in keyof WebviewToExtensionDataMap]: {
    /** 指令 */
    command: K;
    /** 参数 */
    params: WebviewToExtensionDataMap[K] extends { params: infer P } ? P : never;
  };
}[keyof WebviewToExtensionDataMap];
