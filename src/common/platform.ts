/**
 * Windows平台下的绝对路径正则
 */
export const windowsAbsolutePathPattern = /^[a-zA-Z]:[\\/]/;

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
 * @param path 路径
 * @returns 转换为Unix风格后的路径
 */
export function convertPathToUnixLike(path: string) {
  return path
    .trim()
    .replace(/[\\\/]+/g, '/')
    .replace(/\/+$/, '')
    .replace(windowsAbsolutePathPattern, (match0) => match0.toLowerCase());
}

/**
 * 获取路径的所在目录，如果路径只有文件名或目录名则返回空字符串。
 *
 * 结果使用{@link convertPathToUnixLike}规范化。
 *
 * @param p 路径
 * @returns 所在目录
 */
export function dirnameOrEmpty(p: string) {
  p = convertPathToUnixLike(p);
  return p.split('/').slice(0, -1).join('/') || '';
}

/**
 * 判断路径是否为（任何平台的）绝对路径。
 * @param path 判断是否为绝对路径
 */
export function isAbsolutePath(path: string) {
  const unixAbsolutePathPattern = /^\//;
  return windowsAbsolutePathPattern.test(path) || unixAbsolutePathPattern.test(path);
}

/**
 * 判断（文件或文件夹）路径是否在参考路径之下（相等时也算）。
 * @param refPath 参考路径
 * @param p 要判断的路径
 * @returns p是否是否为refPath的子路径
 */
export function isPathUnderOrEqual(refPath: string, p: string): boolean {
  const normalizedPathRef = convertPathToUnixLike(refPath) + '/';
  const normalizedPathTarget = convertPathToUnixLike(p) + '/';
  return normalizedPathTarget.startsWith(normalizedPathRef);
}

/**
 * 移除路径中的`.exe`后缀（不区分大小写，如果有）。
 * @param path 路径
 * @returns 移除了`.exe`后缀的路径
 */
export function removeExeSuffix(path: string) {
  return path.replace(/\.exe$/i, '');
}
