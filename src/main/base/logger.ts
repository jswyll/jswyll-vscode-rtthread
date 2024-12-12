/* eslint-disable no-console */
import * as vscode from 'vscode';
import { formatTime } from '../../common/utils';
import { EXTENSION_ID } from '../../common/constants';

/**
 * vscode的日志输出通道
 */
const logOutputChannel = vscode.window.createOutputChannel(EXTENSION_ID, { log: true });

/**
 * 同时输出到控制台和vscode日志输出通道的日志记录器类
 */
export class Logger {
  /**
   * 构造函数。
   * @param tag 日志标签
   */
  constructor(readonly tag: string) {
    this.tag = `${EXTENSION_ID} - ${tag}`;
  }

  /**
   * 输出到控制台。
   * @param logFn 控制台输出函数
   * @param args 参数
   */
  private consoleLog(logFn: (message: unknown, ...args: unknown[]) => void, ...args: unknown[]) {
    logFn(`${formatTime('HH:mm:ss')} [${this.tag}]`, ...args);
  }

  /**
   * 记录跟踪日志。
   * @param message 消息
   * @param args 参数
   */
  trace(message: string, ...args: unknown[]) {
    logOutputChannel.trace(message, ...args);
    if (logOutputChannel.logLevel !== vscode.LogLevel.Off && logOutputChannel.logLevel <= vscode.LogLevel.Trace) {
      this.consoleLog(console.trace, message, ...args);
    }
  }

  /**
   * 记录调试日志。
   * @param message 消息
   * @param args 参数
   */
  debug(message: string, ...args: unknown[]) {
    logOutputChannel.debug(message, ...args);
    if (logOutputChannel.logLevel !== vscode.LogLevel.Off && logOutputChannel.logLevel <= vscode.LogLevel.Debug) {
      this.consoleLog(console.debug, message, ...args);
    }
  }

  /**
   * 记录信息日志。
   * @param message 消息
   * @param args 参数
   */
  info(message: string, ...args: unknown[]) {
    logOutputChannel.info(message, ...args);
    if (logOutputChannel.logLevel !== vscode.LogLevel.Off && logOutputChannel.logLevel <= vscode.LogLevel.Info) {
      this.consoleLog(console.info, message, ...args);
    }
  }

  /**
   * 记录警告日志。
   * @param message 消息
   * @param args 参数
   */
  warn(message: string, ...args: unknown[]) {
    logOutputChannel.warn(message, ...args);
    if (logOutputChannel.logLevel !== vscode.LogLevel.Off && logOutputChannel.logLevel <= vscode.LogLevel.Warning) {
      this.consoleLog(console.warn, message, ...args);
    }
  }

  /**
   * 记录错误日志。
   * @param message 消息或错误对象
   * @param args 参数
   */
  error(message: unknown, ...args: unknown[]) {
    let msg;
    if (message instanceof Error) {
      msg = message;
    } else {
      msg = String(message);
    }
    logOutputChannel.error(msg, ...args);
    if (logOutputChannel.logLevel !== vscode.LogLevel.Off && logOutputChannel.logLevel <= vscode.LogLevel.Error) {
      this.consoleLog(console.error, message, ...args);
    }
  }
}
