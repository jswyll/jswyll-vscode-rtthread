import {
  formatTime,
  getNonce,
  toHexString,
  msleep,
  isJsonObject,
  addToSet,
  findLastMatch,
  vueI18nEscape,
  vueI18nUnescape,
} from '../../../common/utils';

describe('工具函数测试', () => {
  describe('格式化时间', () => {
    it('应正确格式化当前时间', async () => {
      const formattedTime = formatTime('YYYY-MM-DD HH:mm:ss');
      expect(formattedTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('应正确格式化指定时间戳', async () => {
      const timestamp = 1735660800000;
      let formattedTime;
      formattedTime = formatTime('YYYY-MM-DD HH:mm:ss', timestamp);
      expect(formattedTime).toBe('2025-01-01 00:00:00');

      formattedTime = formatTime('YYYY-M-D HH:mm:ss', timestamp);
      expect(formattedTime).toBe('2025-1-1 00:00:00');
    });
  });

  describe('生成随机字符串', () => {
    it('应生成指定长度的随机字符串', async () => {
      const length = 10;
      const nonce = getNonce(length);
      expect(nonce).toHaveLength(length);
    });
  });

  describe('数字转Hex字符串', () => {
    it('应正确转换数字为Hex字符串', async () => {
      expect(toHexString(255)).toBe('0xFF');
      expect(toHexString(255, 4)).toBe('0x00FF');
      expect(toHexString(255, 4, true)).toBe('00FF');
    });
  });

  describe('延迟一段时间', () => {
    it('应延迟指定时间', async () => {
      const startTime = Date.now();
      await msleep(100);
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('判断JSON值是否为JSON对象', () => {
    it('应正确判断JSON对象', async () => {
      expect(isJsonObject({})).toBe(true);
      expect(isJsonObject([])).toBe(false);
      expect(isJsonObject(null)).toBe(false);
      expect(isJsonObject(undefined)).toBe(false);
      expect(isJsonObject('string')).toBe(false);
      expect(isJsonObject(123)).toBe(false);
    });
  });

  describe('将一个值添加到数组中', () => {
    it('应正确添加值到数组中', async () => {
      const array: number[] = [];
      addToSet(array, 1);
      addToSet(array, [2, 3, 3]);
      expect(array).toEqual([1, 2, 3]);
    });
  });

  describe('在给定文本中查找最后一个匹配项', () => {
    it('应正确查找最后一个匹配项', async () => {
      const regex = /(\d+)/g;
      const text = 'abc123def456ghi789';
      const lastMatch = findLastMatch(regex, text);
      expect(lastMatch?.[0]).toBe('789');
    });
  });

  describe('vue i18n 特殊字符转义', () => {
    it('应正确转义特殊字符', async () => {
      expect(vueI18nEscape('a{b@c|d}e$f')).toBe("a'{'b'@'c'|'d'}'e'$'f");
    });
  });

  describe('vue i18n 特殊字符还原', () => {
    it('应正确还原特殊字符', async () => {
      expect(vueI18nUnescape("a'{'b'@'c'|'d'}'e'$'f")).toBe('a{b@c|d}e$f');
    });
  });
});
