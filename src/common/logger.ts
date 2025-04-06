import { EXTENSION_ID } from './constants';
import { formatTime } from './utils';

/**
 * 默认的console对象
 */
const consoleLogger = console;

/**
 * 日志打印等级
 */
export enum MyLoggerLevel {
  /**
   * 关闭
   */
  Off = 0,

  /**
   * 错误
   */
  Error = 1,

  /**
   * 警告
   */
  Warning = 2,

  /**
   * 信息
   */
  Info = 3,

  /**
   * 调试
   */
  Debug = 4,

  /**
   * 详细
   */
  Verbose = 5,

  /**
   * 全部
   */
  All = 6,
}

/**
 * 日志类
 */
export class MyLogger {
  /**
   * 实例化MyLogger类
   * @param tag 日志标签
   * @param level 日志打印等级
   */
  constructor(
    protected readonly tag: string,
    protected level: MyLoggerLevel,
  ) {
    this.tag = `${EXTENSION_ID} - ${tag}`;
    this.level = level;
  }

  /**
   * 获取格式化时间
   * @returns 格式化时间, 形如`00:00:00`
   */
  protected getFormatTime() {
    return formatTime('HH:mm:ss');
  }

  /**
   * 根据指定等级决定是否输出日志
   * @param level 日志打印等级
   * @param args 可变参数
   */
  protected log(level: MyLoggerLevel, args: unknown[]): void {
    if (this.level < level) {
      return;
    }

    const applyArgs = [`${this.getFormatTime()} [${this.tag}]`, ...args];
    if (level === MyLoggerLevel.Error) {
      consoleLogger.error.apply(this, applyArgs);
    } else if (level === MyLoggerLevel.Warning) {
      consoleLogger.warn.apply(this, applyArgs);
    } else if (level === MyLoggerLevel.Verbose || level === MyLoggerLevel.Debug) {
      consoleLogger.debug.apply(this, applyArgs);
    } else {
      consoleLogger.info.apply(this, applyArgs);
    }
  }

  public verbose(...args: unknown[]): void {
    this.log(MyLoggerLevel.Verbose, args);
  }

  public debug(...args: unknown[]): void {
    this.log(MyLoggerLevel.Debug, args);
  }

  public info(...args: unknown[]): void {
    this.log(MyLoggerLevel.Info, args);
  }

  public warning(...args: unknown[]): void {
    this.log(MyLoggerLevel.Warning, args);
  }

  public error(...args: unknown[]): void {
    this.log(MyLoggerLevel.Error, args);
  }
}
