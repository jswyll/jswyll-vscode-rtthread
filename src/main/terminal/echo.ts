import * as vscode from 'vscode';

/**
 * 回显终端模拟器。
 *
 * 当终端被打开时，它将构造函数参数中的文本回显到终端，然后关闭。
 */
export class EchoPseudoterminal implements vscode.Pseudoterminal {
  /**
   * 写入事件的发射器
   *
   * 事件数据为要写入的文本
   */
  private writeEmitter = new vscode.EventEmitter<string>();

  /**
   * 关闭事件的发射器
   *
   * 事件数据为关闭事件的退出码（0表示正常退出）
   */
  private closeEmitter = new vscode.EventEmitter<number>();

  /**
   * 订阅写入事件。
   */
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  /**
   * 订阅关闭事件。
   */
  public onDidClose: vscode.Event<number> = this.closeEmitter.event;

  /**
   * 构造函数。
   *
   * @param text 要回显的文本，回显时会追加`\r\n`
   */
  constructor(private text: string) {}

  /**
   * 处理打开终端。
   */
  async open() {
    this.writeEmitter.fire(`${this.text}\r\n`);
    this.closeEmitter.fire(0);
  }

  /**
   * 处理关闭终端。
   */
  close() {}
}
