/**
 * 错误类 - 执行任务出错。
 *
 * 出现以下情况之一：
 *
 * - 执行完成后退出代码不为0。
 *
 * - 任务启动失败。
 *
 * - 任务被中断。
 */
export class ExecuteTaskError extends Error {
  /**
   * 构造函数
   * @param message 错误提示语
   * @param exitCode 退出代码，当任务启动失败或被中断时为`undefined`
   */
  constructor(
    message: string,
    public readonly exitCode: number | undefined,
  ) {
    super(message);
    this.name = 'ExecuteTaskError';
  }
}

/**
 * 错误类 - 未找到指定的任务。
 */
export class TaskNotFoundError extends Error {
  /**
   * 构造函数
   * @param message 错误提示语
   */
  constructor(message: string) {
    super(message);
    this.name = 'TaskNotFoundError';
  }
}

/**
 * 错误类 - 执行子进程后出错。
 */
export class SpawnError extends Error {
  /**
   * 构造函数
   * @param message 错误提示语
   * @param stdout stdout输出
   * @param stderr stderr输出
   */
  constructor(
    message: string,
    public readonly stdout: string,
    public readonly stderr: string,
  ) {
    super(message);
    this.name = 'SpawnError';
  }
}

/**
 * 警告类 - 表单校验不通过。
 */
export class TdesignValidateError extends Error {
  /**
   * 构造函数
   * @param message 错误提示语
   * @param type 提示类型
   */
  constructor(
    message: string,
    public readonly type: 'error' | 'warning',
  ) {
    super(message);
    this.name = 'TdesignValidateError';
  }
}
