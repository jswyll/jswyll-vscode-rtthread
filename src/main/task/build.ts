import * as vscode from 'vscode';
import { assertParam } from '../../common/assert';
import { ExecuteTaskError, TaskNotFoundError } from '../base/error';
import { TASKS_JSON_RELATIVE_PATH } from '../base/constants';
import { Logger } from '../base/logger';
import { SerialTaskManager } from './serial';
import { BUILD_TASKS_LABEL_PREFIX, EXTENSION_ID } from '../../common/constants';
import { formatTime } from '../../common/utils';
import { EchoPseudoterminal } from '../terminal/echo';
import { parseJsonFile } from '../base/fs';
import { TasksJson } from '../base/type';

/**
 * 日志记录器
 */
const logger = new Logger('main/task/build');

/**
 * 构建相关的串行任务管理器
 */
const buildTaskManager = new SerialTaskManager();

/**
 * 在工作区文件夹的`.vscode/tasks.json`中查找任务。
 *
 * 如果存在`${name}`任务则优先返回，否则查找`${extensionId}: ${name}`并返回。
 *
 * @param workspaceFolder 工作区文件夹
 * @param name 任务名称
 */
async function fetchTask(workspaceFolder: vscode.WorkspaceFolder, name: string) {
  const tasks = await vscode.tasks.fetchTasks();
  logger.trace('tasks:', tasks);
  const matchTasks = tasks.filter(
    (task) => task.scope === workspaceFolder || task.scope === vscode.TaskScope.Workspace,
  );
  const task = matchTasks.find((task) => task.name === name);
  if (task) {
    return task;
  }
  return matchTasks.find((task) => task.name === BUILD_TASKS_LABEL_PREFIX + name);
}

/**
 * 在tasks.json中查找任务。
 *
 * 如果存在`${name}`任务则优先返回，否则查找`${extensionId}: ${name}`并返回。
 *
 * @param workspaceFolder 工作区文件夹
 * @param name 任务名称
 * @throws `.vscode/tasks.json`文件不存在时抛出{@link Error}
 */
async function findTaskInTasksJson(workspaceFolder: vscode.WorkspaceFolder, name: string) {
  const tasksJson = await parseJsonFile<TasksJson>(vscode.Uri.joinPath(workspaceFolder.uri, TASKS_JSON_RELATIVE_PATH));
  const task = tasksJson.tasks.find((task) => task.label === name);
  if (task) {
    return task;
  }
  return tasksJson.tasks.find((task) => task.label === BUILD_TASKS_LABEL_PREFIX + name);
}

/**
 * 执行构建任务。
 * @param workspaceFolder 工作区文件夹
 * @param taskName 任务在tasks.json中的label
 */
export async function runBuildTask(workspaceFolder: vscode.WorkspaceFolder, taskName: string) {
  logger.debug('runBuildTask:', taskName);
  const [task, taskJson] = await Promise.all([
    fetchTask(workspaceFolder, taskName),
    findTaskInTasksJson(workspaceFolder, taskName),
  ]);
  logger.debug('task:', task);
  logger.info('taskJson:', taskJson);
  assertParam(
    task && taskJson,
    new TaskNotFoundError(vscode.l10n.t('Not found task {0} in {1}', [taskName, 'tasks.json'])),
  );

  if (taskJson.dependsOn?.length) {
    const promises: Promise<void>[] = [];
    for (const dependency of taskJson.dependsOn) {
      const promise = runBuildTask(workspaceFolder, dependency);
      if (taskJson.dependsOrder === 'sequence') {
        logger.debug('dependency:', dependency);
        await promise;
      } else {
        promises.push(promise);
      }
    }
    await Promise.all(promises);
  } else if (!task.execution) {
    throw new Error(vscode.l10n.t('Task {0} has no execution and no dependencies', [taskName]));
  }

  if (task.execution) {
    task.presentationOptions.showReuseMessage = false;
    let problemMatchers: string | string[] | undefined = undefined;
    if (typeof taskJson.problemMatcher === 'string') {
      problemMatchers = [taskJson.problemMatcher];
    } else if (Array.isArray(taskJson.problemMatcher)) {
      problemMatchers = taskJson.problemMatcher.filter((matcher) => typeof matcher === 'string');
    }
    buildTaskManager.addTask(
      {
        type: EXTENSION_ID,
        id: taskName,
        command: 'build',
      },
      workspaceFolder,
      taskName.replace(BUILD_TASKS_LABEL_PREFIX, ''),
      EXTENSION_ID,
      task.execution,
      problemMatchers,
      task.presentationOptions,
    );
    const startTimestamp = Date.now();
    let resultText = '';
    try {
      await buildTaskManager.runTasks();
      const buildTime = ((Date.now() - startTimestamp) / 1000).toFixed(3);
      resultText = `\x1b[32m${formatTime('HH:mm:ss')} ${taskJson.label} finished. (took ${buildTime}s)\x1b[0m`;
    } catch (error) {
      let errorType = 'fail';
      if (error instanceof ExecuteTaskError && error.exitCode === undefined) {
        errorType = 'cancelled';
      }
      const buildTime = ((Date.now() - startTimestamp) / 1000).toFixed(3);
      resultText = `\x1b[31m${formatTime('HH:mm:ss')} ${taskJson.label} ${errorType}. (took ${buildTime}s)\x1b[0m`;
      throw error;
    } finally {
      buildTaskManager.addTask(
        {
          type: EXTENSION_ID,
          id: `${taskName} - result`,
          command: 'echo',
          args: [' '],
        },
        workspaceFolder,
        taskName.replace(BUILD_TASKS_LABEL_PREFIX, '') + ' - result',
        EXTENSION_ID,
        new vscode.CustomExecution(async (): Promise<vscode.Pseudoterminal> => {
          return new EchoPseudoterminal(resultText);
        }),
        [],
        {
          echo: false,
          showReuseMessage: true,
        },
      );
      await buildTaskManager.runTasks();
    }
  }
}

export { buildTaskManager, findTaskInTasksJson };
