import * as vscode from 'vscode';
import { Logger } from '../base/logger';
import { ExecuteTaskError } from '../base/error';
import { EXTENSION_ID } from '../../common/constants';

/**
 * 日志记录器
 */
const logger = new Logger('main/task/serial');

/**
 * 任务定义
 */
export interface CustomTaskDefinition extends vscode.TaskDefinition {
  /**
   * 类型
   */
  type: typeof EXTENSION_ID;

  /**
   * ID
   */
  id: string;

  /**
   * 命令
   */
  command: 'echo' | 'build';
}

/**
 * 串行任务管理器
 */
export class SerialTaskManager implements vscode.Disposable {
  /**
   * 所有任务
   */
  private tasks: vscode.Task[] = [];

  /**
   * 监听器
   */
  private disposables: vscode.Disposable[] = [];

  /**
   * 所有任务执行完毕的事件
   */
  private allTasksCompletedEmitter = new vscode.EventEmitter<void>();

  /**
   * 监听所有任务执行完毕。
   */
  public onAllTasksCompleted = this.allTasksCompletedEmitter.event;

  /**
   * 添加任务。
   *
   * 在调用{@link runTasks}之前任务不会执行。
   *
   * @param taskDefinition 任务定义
   * @param scope 作用域
   * @param name 向用户显示的任务名称
   * @param source 任务来源
   * @param execution 执行器
   * @param problemMatchers 问题匹配器
   * @param presentationOptions 显示选项
   */
  public addTask(
    taskDefinition: CustomTaskDefinition,
    scope: vscode.WorkspaceFolder | vscode.TaskScope,
    name: string,
    source: string,
    execution: vscode.ShellExecution | vscode.ProcessExecution | vscode.CustomExecution,
    problemMatchers: string | string[] | undefined,
    presentationOptions: vscode.TaskPresentationOptions,
  ) {
    const newTask: vscode.Task = new vscode.Task(taskDefinition, scope, name, source, execution, problemMatchers);
    newTask.presentationOptions = presentationOptions;
    this.tasks.push(newTask);
  }

  /**
   * 销毁任务管理器。
   */
  public dispose() {
    this.cancelTasks();
  }

  /**
   * 执行已添加的全部任务。
   * @returns 全部任务执行完毕的Promise
   * @throws 任务执行后退出代码不为0时取消剩余的任务并抛出{@link ExecuteTaskError}
   */
  public async runTasks() {
    if (this.tasks.length === 0) {
      logger.warn('no tasks to run');
      return;
    }

    return new Promise<void>(async (resolve, reject) => {
      /*
       * FIXME: 如果上一次启动进程失败（例如vscode解析到的execution定义无效），下一次启动任务只触发onDidStartTask
       * 不触发onDidEndTaskProcesson、DidEndTask，进而导致Promise永远不被解析
       */
      let execution: vscode.TaskExecution | undefined = undefined;
      const onDidEndTaskProcessDisposable = vscode.tasks.onDidEndTaskProcess(async (e) => {
        if (
          e.execution.task.definition.type === EXTENSION_ID &&
          e.execution.task.definition.id === execution?.task.definition.id
        ) {
          logger.info(`task process end: "${execution?.task.definition.id}"`);
          this.tasks.splice(0, 1);
          if (e.exitCode !== 0) {
            const error = new ExecuteTaskError(
              vscode.l10n.t('An error occurred while executing the task "{0}", exit code: {1}', [
                e.execution.task.name,
                String(e.exitCode),
              ]),
              e.exitCode,
            );
            logger.error(error);
            this.cancelTasks();
            onDidEndTaskProcessDisposable.dispose();
            this.allTasksCompletedEmitter.fire();
            return reject(error);
          }

          if (this.tasks.length === 0) {
            onDidEndTaskProcessDisposable.dispose();
            logger.info('all tasks completed');
            this.allTasksCompletedEmitter.fire();
            return resolve();
          } else {
            execution = await vscode.tasks.executeTask(this.tasks[0]);
            logger.info(`start task: "${execution.task.definition.id}"`);
          }
        }
      });
      this.disposables.push(onDidEndTaskProcessDisposable);
      execution = await vscode.tasks.executeTask(this.tasks[0]);
      logger.info(`start task: "${execution.task.definition.id}"`);
    });
  }

  /**
   * 获取当前的任务数量。
   */
  public getSize() {
    return this.tasks.length;
  }

  /**
   * 等待当前的所有任务执行结束（失败也算），没有任务时立即解析Promise。
   */
  public async waitAllTasksCompleted() {
    if (this.tasks.length === 0) {
      return;
    }
    return new Promise<void>((resolve) => {
      const disposable = this.onAllTasksCompleted(() => {
        disposable.dispose();
        resolve();
      });
    });
  }

  /**
   * 取消所有任务。
   */
  public cancelTasks() {
    for (const task of this.tasks) {
      const execution = vscode.tasks.taskExecutions.find((t) => {
        return t.task.definition.type === EXTENSION_ID && t.task.definition.id === task.definition.id;
      });
      if (execution) {
        logger.info('terminate task:', execution.task.definition.id);
        execution.terminate();
      }
    }
    this.tasks = [];
  }

  /**
   * 释放监听器。
   */
  public disposeListeners() {
    logger.trace('disposeListeners');
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
