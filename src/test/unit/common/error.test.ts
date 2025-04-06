import { getErrorMessage } from '../../../common/error';

describe('错误处理', () => {
  describe('获取错误信息', () => {
    it('应返回Error对象的message属性', () => {
      const error = new Error('这是一个错误');
      expect(getErrorMessage(error)).toBe('这是一个错误');
    });

    it('应返回字符串类型的错误信息', () => {
      const error = '这是错误提示语';
      expect(getErrorMessage(error)).toBe('这是错误提示语');
    });
  });
});
