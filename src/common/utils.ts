/**
 * 获取格式化时间。
 * @param fmt 时间格式，例如`YYYY-MM-DD HH:mm:ss`
 * @param timestamp 指定时间戳毫秒数，不指定则使用当前时间
 * @returns 格式化后的时间
 */
export function formatTime(fmt: string, timestamp?: number) {
  let date: Date;
  if (timestamp) {
    date = new Date(timestamp);
  } else {
    date = new Date();
  }
  const o: Record<string, number> = {
    'M+': date.getMonth() + 1,
    'D+': date.getDate(),
    'H+': date.getHours(),
    'm+': date.getMinutes(),
    's+': date.getSeconds(),
    S: date.getMilliseconds(),
  };
  const match = fmt.match(/(Y+)/);
  if (match) {
    fmt = fmt.replace(match[1], (date.getFullYear() + '').substring(4 - match[1].length));
  }
  for (const k in o) {
    const match = fmt.match(new RegExp('(' + k + ')'));
    if (match) {
      fmt = fmt.replace(
        match[1],
        match[1].length === 1 ? o[k].toString() : ('00' + o[k]).substring(('' + o[k]).length),
      );
    }
  }
  return fmt;
}

/**
 * 生成随机字符串，其中的字符为大小写字母或数字。
 * @param length 字符串长度
 * @returns 随机字符串
 */
export function getNonce(len: number) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < len; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * 延迟一段时间。
 * @param ms 延迟时间，单位为毫秒
 * @returns 时间到时解析的Promise
 */
export function msleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 将字符串中的正则表达式特殊字符转义为普通字符。
 * @param string 要转换的字符串
 * @returns 转换后的字符串
 */
export function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 判断一个JSON值是否为JSON对象。
 * @param value 要判断的值
 * @returns 是否为JSON对象
 */
export function isJsonObject(value: unknown) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/**
 * 将一个值添加到数组中，如果数组中已经存在该值，则不添加。
 * @param array 数组
 * @param value 要添加的值
 */
export function addToSet<T>(array: T[], value: T | T[]) {
  if (Array.isArray(value)) {
    value.forEach((value) => {
      if (array.indexOf(value) === -1) {
        array.push(value);
      }
    });
  } else {
    if (array.indexOf(value) === -1) {
      array.push(value);
    }
  }
}
