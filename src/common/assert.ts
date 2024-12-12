/**
 * 断言参数。
 * @param expression 表达式
 * @param message 错误提示语或错误的实例
 * @throws 不满足时抛出{@link Error}
 */
export function assertParam(expression: unknown, message: string | Error = 'unexpected state'): asserts expression {
  if (!expression) {
    if (message instanceof Error) {
      throw message;
    }
    throw new Error(message);
  }
}
