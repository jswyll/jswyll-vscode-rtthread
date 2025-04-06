import { CustomEvent } from '../../../common/event';
import { fn } from 'jest-mock';

describe('事件处理', () => {
  describe('监听事件', () => {
    it('应正确添加监听器', () => {
      const event = new CustomEvent();
      const listener = fn();
      event.on('testEvent', listener);
      event.emit('testEvent');
      expect(listener).toHaveBeenCalled();
    });

    it('应正确触发多个监听器', () => {
      const event = new CustomEvent();
      const listener1 = fn();
      const listener2 = fn();
      event.on('testEvent', listener1);
      event.on('testEvent', listener2);
      event.emit('testEvent');
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('监听一次事件', () => {
    it('应正确触发一次监听器', () => {
      const event = new CustomEvent();
      const listener = fn();
      event.once('testEvent', listener);
      event.emit('testEvent');
      expect(listener).toHaveBeenCalled();
      event.emit('testEvent');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('取消监听事件', () => {
    it('应正确移除特定监听器', () => {
      const event = new CustomEvent();
      const listener1 = fn();
      const listener2 = fn();
      event.on('testEvent', listener1);
      event.on('testEvent', listener2);
      event.off('testEvent', listener1);
      event.emit('testEvent');
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('应正确移除所有监听器', () => {
      const event = new CustomEvent();
      const listener1 = fn();
      const listener2 = fn();
      event.on('testEvent', listener1);
      event.on('testEvent', listener2);
      event.off('testEvent');
      event.emit('testEvent');
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('重复取消监听应无副作用', () => {
      const event = new CustomEvent();
      const listener = fn();
      event.on('testEvent', listener);
      event.off('testEvent', listener);
      event.off('testEvent', listener);
    });

    it('取消监听未监听的事件应无副作用', () => {
      const event = new CustomEvent();
      const listener = fn();
      event.off('testEvent', listener);
    });
  });

  describe('触发事件', () => {
    it('应正确传递参数给监听器', () => {
      const event = new CustomEvent();
      const listener = fn();
      event.on('testEvent', listener);
      event.emit('testEvent', 'arg1', 'arg2');
      expect(listener).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('应正确处理无监听器的事件', () => {
      const event = new CustomEvent();
      expect(() => event.emit('nonExistentEvent')).not.toThrow();
    });
  });
});
