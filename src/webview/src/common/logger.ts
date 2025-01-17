import { EXTENSION_ID } from '../../../common/constants';
import { formatTime } from '../../../common/utils';

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
   * 日志标签
   */
  protected readonly tag: string;
  /**
   * 日志打印等级
   */
  protected level: MyLoggerLevel;

  /**
   * 实例化MyLogger类
   * @param tag 日志标签
   * @param level 日志打印等级。如果不提供此参数，则开发环境默认为Debug，生产环境默认为Info
   */
  constructor(tag: string, level?: MyLoggerLevel) {
    this.tag = `${EXTENSION_ID} - ${tag}`;
    if (level) {
      this.level = level;
    } else {
      this.level = import.meta.env.DEV ? MyLoggerLevel.Debug : MyLoggerLevel.Info;
    }
  }

  /**
   * 获取格式化时间
   * @returns 格式化时间, 形如`2020-01-01 00:00:00`
   */
  protected getFormatTime() {
    return formatTime('HH:mm:ss');
  }

  /**
   * 根据指定等级决定是否输出日志或执行指定的动作
   * @param level 日志打印等级
   * @param args 可变参数
   */
  protected log(level: MyLoggerLevel, args: unknown[]): void {
    if (this.level < level) {
      return;
    }

    const applyArgs = [`${formatTime('HH:mm:ss')} [${this.tag}]`, ...args];
    if (level === MyLoggerLevel.Error) {
      consoleLogger.error.apply(this, applyArgs);
    }
    if (level === MyLoggerLevel.Warning) {
      consoleLogger.warn.apply(this, applyArgs);
    } else if (level === MyLoggerLevel.Info) {
      consoleLogger.info.apply(this, applyArgs);
    } else if (level === MyLoggerLevel.Verbose) {
      consoleLogger.debug.apply(this, applyArgs);
    } else {
      consoleLogger.log.apply(this, applyArgs);
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
