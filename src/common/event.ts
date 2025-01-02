/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 事件类
 */
export class CustomEvent {
  /**
   * 监听器组
   */
  private listeners: { [key: string]: Array<(...args: any[]) => void> } = {};

  /**
   * 监听事件。
   * @param event 事件名
   * @param listener 监听器
   */
  on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  /**
   * 监听一次事件。
   * @param event 事件名
   * @param listener 监听器
   */
  once(event: string, listener: (...args: any[]) => void) {
    const wrappedCallback = (...args: any[]) => {
      listener(...args);
      this.off(event, wrappedCallback);
    };
    this.on(event, wrappedCallback);
  }

  /**
   * 取消监听事件。
   * @param event 事件名
   * @param listener 监听器。不传此参数则移除该事件的所有监听器
   */
  off(event: string, listener?: (...args: any[]) => void) {
    if (!this.listeners[event]) {
      return;
    }
    if (!listener) {
      this.listeners[event] = [];
    } else {
      const index = this.listeners[event].indexOf(listener);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  /**
   * 触发事件。
   * @param event 事件名
   * @param args 参数
   */
  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) {
      return;
    }
    this.listeners[event].forEach((listener) => {
      listener(...args);
    });
  }
}
