import { assertParam } from '../../../common/assert';

describe('断言参数', () => {
  describe('表达式为真', () => {
    it('不应抛出错误', async () => {
      expect(() => assertParam(true, 'should not throw')).not.toThrow();
    });

    it('不应抛出错误，即使提供错误对象', async () => {
      expect(() => assertParam(true, new Error('should not throw'))).not.toThrow();
    });
  });

  describe('表达式为假', () => {
    it('应根据错误提示语抛出错误', async () => {
      expect(() => assertParam(false, 'custom error message')).toThrow('custom error message');
    });

    it('应抛出自定义错误对象', async () => {
      const customError = new Error('custom error');
      expect(() => assertParam(false, customError)).toThrow(customError);
    });

    it('应抛出默认错误消息', async () => {
      expect(() => assertParam(false)).toThrow('unexpected state');
    });
  });
});
