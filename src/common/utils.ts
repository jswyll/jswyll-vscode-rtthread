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
 * 把数字转为Hex字符串
 * @param value 数字
 * @param padStart 长度（一个字节为2），如果指定了则在长度不足时在开头填充`0`。
 * @param isNotAddPrefix 是否不添加`0x`前缀
 */
export const toHexString = (value: number, padStart?: number, isNotAddPrefix?: boolean) => {
  let result = value.toString(16).toUpperCase();
  if (padStart !== undefined) {
    result = result.padStart(padStart, '0');
  }
  if (!isNotAddPrefix) {
    result = '0x' + result;
  }
  return result;
};

/**
 * 延迟一段时间。
 * @param ms 延迟时间，单位为毫秒
 * @returns 时间到时解析的Promise
 */
export function msleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * @param array 被添加的数组
 * @param value 要添加的值
 * @param prepend 是否在数组开头添加，默认为否
 */
export function addToSet<T>(array: T[], value: T | T[], prepend: boolean = false) {
  if (Array.isArray(value)) {
    value.forEach((value) => {
      if (array.indexOf(value) === -1) {
        if (prepend) {
          array.unshift(value);
        } else {
          array.push(value);
        }
      }
    });
  } else {
    if (array.indexOf(value) === -1) {
      if (prepend) {
        array.unshift(value);
      } else {
        array.push(value);
      }
    }
  }
}

/**
 * 在给定文本中查找最后一个匹配项。
 *
 * 此函数使用正则表达式来查找文本中的匹配项，并返回最后一个匹配项。
 * 它从文本的开头开始查找匹配项，并在找到匹配项时更新匹配项。
 * 如果没有找到匹配项，则返回`undefined`。
 *
 * @param regex 正则表达式对象，用于查找匹配项，应包含g标志
 * @param text 要查找的文本
 * @returns 最后一个匹配项
 */
export function findLastMatch(regex: RegExp, text: string) {
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }
  return lastMatch;
}

/**
 * 将字符串中的特殊字符转义，用于在Vue I18n中使用。
 * @param s 要转义的字符串
 * @returns 转义后的字符串
 */
export function vueI18nEscape(s: string) {
  return s.replace(/[{}@$|]/g, (...match) => {
    return `'${match[0]}'`;
  });
}

/**
 * 将转义后的字符串中的特殊字符还原。
 * @param s 要还原的字符串
 * @returns 还原后的字符串
 */
export function vueI18nUnescape(s: string) {
  return s.replace(/'([{}@$|])'/g, (...match) => {
    return match[1];
  });
}
