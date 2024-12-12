/**
 * 获取错误信息的字符串。
 * @param error 错误对象
 * @returns 错误消息
 */
export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
