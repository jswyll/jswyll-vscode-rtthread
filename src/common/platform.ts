/**
 * Windows平台下的绝对路径正则
 */
export const windowsAbsolutePathPattern = /^[a-zA-Z]:[\\/]/;

/**
 * Unix平台下的绝对路径正则
 */
export const unixAbsolutePathPattern = /^\//;

/**
 * 将路径转换为Unix风格。
 *
 * - 反斜杠`\`转为`/`。
 *
 * - 去除首尾的空格。
 *
 * - 连续的斜杠转为单个斜杠。
 *
 * - 去除末尾的斜杠。
 *
 * - 盘符转为小写。
 *
 * @param p 路径
 */
export function toUnixPath(p: string) {
  return p
    .trim()
    .replace(/[\\\/]+/g, '/')
    .replace(/\/+$/, '')
    .replace(windowsAbsolutePathPattern, (match0) => match0.toLowerCase());
}

/**
 * 获取路径的所在目录，如果路径只有文件名或目录名则返回空字符串。
 *
 * 结果使用{@link toUnixPath}规范化。
 *
 * @param p 路径
 */
export function dirnameOrEmpty(p: string) {
  // TODO: 如果是根目录，应该返回什么？
  p = toUnixPath(p);
  return p.split('/').slice(0, -1).join('/') || '';
}

/**
 * 判断路径是否为（任何平台的）绝对路径。
 * @param p 要判断的路径
 */
export function isAbsolutePath(p: string) {
  return windowsAbsolutePathPattern.test(p) || unixAbsolutePathPattern.test(p);
}

/**
 * 判断（文件或文件夹）路径是否在参考路径之下（相等时也算）。
 * @param refPath 参考路径
 * @param p 要判断的路径
 * @note 判断前会使用{@link toUnixPath}规范化。
 */
export function isPathUnderOrEqual(refPath: string, p: string): boolean {
  const normalizedPathRef = toUnixPath(refPath) + '/';
  const normalizedPathTarget = toUnixPath(p) + '/';
  return normalizedPathTarget.startsWith(normalizedPathRef);
}

/**
 * 移除路径中的`.exe`后缀（不区分大小写，如果有）。
 * @param path 路径
 */
export function removeExeSuffix(path: string) {
  return path.replace(/\.exe$/i, '');
}

/**
 * 计算环境变量PATH的字符串。
 *
 * 结果使用{@link toUnixPath}规范化。
 *
 * @param paths 路径字符串
 * @param delimiter 分隔符
 * @returns 去重的形如`foo;bar`或`foo:bar`的字符串
 */
export function calculateEnvPathString(paths: string[], delimiter: ';' | ':') {
  return Array.from(new Set(paths)).map(toUnixPath).join(delimiter);
}
