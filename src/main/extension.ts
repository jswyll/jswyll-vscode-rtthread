import * as vscode from 'vscode';
import {
  getConfig,
  getGlobalState,
  getOrPickAWorkspaceFolder as getOrPickWorkspaceFolder,
  onWorkspaceFolderChange,
  pickWorkspaceFolder,
  setExtensionContext,
  updateGlobalState,
  workspaceFolderChangeEmitter,
} from './base/workspace';
import { checkAndOpenGenerateWebview, parseProjcfgIni, parseSelectedBuildConfigs } from './project/generate';
import { ExecuteTaskError, TaskNotFoundError } from './base/error';
import { BUILD_TASKS, CONFIG_GROUP } from './base/constants';
import { EXTENSION_ID } from '../common/constants';
import { MakefileProcessor } from './project/makefile';
import { buildTaskManager, findTaskInTasksJson, runBuildTask } from './task/build';
import { Logger } from './base/logger';
import { createInterruptDiagnosticAndQuickfix, doDiagnosticInterrupt } from './project/diagnostic';

/**
 * 日志记录器
 */
const logger = new Logger('extension');

/**
 * 构建相关的状态栏按钮
 */
const buildStatusBarItems: vscode.StatusBarItem[] = [];

/**
 * 判断当前工作区是否为RT-Thread项目。
 *
 * @returns 是否为RT-Thread项目
 */
async function getIsRtthreadProject() {
  // TOOD: 添加更精确的判断
  const files = await vscode.workspace.findFiles('.cproject');
  logger.debug('.cproject files:', files);
  return files.length > 0;
}

/**
 * 打开生成配置面板并处理结果。
 * @param wsFolder 当前工作区文件夹
 */
async function doCheckAndOpenGenerateWebview(wsFolder: vscode.Uri) {
  await checkAndOpenGenerateWebview(wsFolder);
  for (const buildStatusBarItem of buildStatusBarItems) {
    buildStatusBarItem.show();
  }
}

/**
 * 执行工作区文件夹中tasks.json定义的任务并处理。
 *
 * 如果是多根工作区且未选择过工作区文件夹，则先弹出选择工作区文件夹窗口。
 *
 * 如果已经有构建正在执行，则先等待执行完成，并显示可取消等待的进度提示。
 *
 * 如果未找到指定的任务，则弹出配置面板并先等等配置完成。
 *
 * @param taskName 任务名称{@link BuildTaskName}
 * @throws 出现除了{@link TaskNotFoundError}和{@link ExecuteTaskError}以外的错误时抛出
 */
async function runBuildTaskAndHandle(taskName: string) {
  const workspaceFolder = await getOrPickWorkspaceFolder();
  try {
    // 等待之前的任务运行完成
    if (buildTaskManager.getSize() > 0) {
      const isCancellationRequested = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: vscode.l10n.t('Wait for the previous tasks to complete'),
          cancellable: true,
        },
        async (_, token) => {
          return new Promise<boolean>((resolve) => {
            const disposable = token.onCancellationRequested(() => {
              resolve(true);
            });
            buildTaskManager
              .waitAllTasksCompleted()
              .then(() => {
                resolve(token.isCancellationRequested);
              })
              .finally(() => {
                disposable.dispose();
              });
          });
        },
      );
      if (isCancellationRequested) {
        return;
      }
    }

    // 运行任务
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: vscode.l10n.t('Running tasks...'),
        cancellable: true,
      },
      async (_, token) => {
        const disposable = token.onCancellationRequested(() => {
          buildTaskManager.cancelTasks();
        });
        try {
          await runBuildTask(workspaceFolder, taskName);
        } finally {
          disposable.dispose();
        }
      },
    );
  } catch (error) {
    if (error instanceof TaskNotFoundError) {
      await doCheckAndOpenGenerateWebview(workspaceFolder.uri);
      await runBuildTaskAndHandle(taskName);
    } else if (!(error instanceof ExecuteTaskError)) {
      throw error;
    }
  }
}

/**
 * 创建左侧状态栏按钮及其命令。
 *
 * 状态按钮的优先级为50，在status.runningTasks按钮（优先级49）的左边。
 *
 * @param context 扩展的上下文
 * @param command 命令的基本名称，它将被添加前缀`${EXTENSION_ID}.`
 * @param text 按钮显示的文本
 * @param tooltip 悬停的提示
 * @param onClick 点击按钮时的回调函数
 * @param isShow 初始时是否显示
 */
function createStatusbarCommand(
  context: vscode.ExtensionContext,
  command: string,
  text: string,
  tooltip: string,
  onClick: () => Thenable<void>,
  isShow: boolean,
) {
  const cmd = `${EXTENSION_ID}.${command}`;
  context.subscriptions.push(vscode.commands.registerCommand(cmd, onClick));
  const statusBarItem = vscode.window.createStatusBarItem(command, vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = cmd;
  statusBarItem.text = text;
  statusBarItem.tooltip = `${EXTENSION_ID} - ${tooltip}`;
  if (isShow) {
    statusBarItem.show();
  }
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

/**
 * 处理扩展被激活。
 * @param context 扩展的上下文
 */
export async function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  const lastVersion = getGlobalState('lastVersion', undefined);
  const thisVersion = context.extension.packageJSON.version;
  logger.info('################################################################################');
  logger.info(`# activate extension, version: ${thisVersion}`);
  logger.info('################################################################################');
  if (lastVersion !== thisVersion) {
    logger.info(`extension updated from version ${lastVersion}`);
    updateGlobalState('lastVersion', thisVersion);
  }

  // 扩展可能因为taskDefinitions贡献点被激活，添加when上下文
  const isRtthreadProject = await getIsRtthreadProject();
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadProject`, isRtthreadProject);
  if (!isRtthreadProject) {
    return;
  }

  // 创建状态栏按钮
  const pickWorkspaceFolderStatusBar = createStatusbarCommand(
    context,
    'pickAWorkspaceFolder',
    '$(file-submodule)',
    vscode.l10n.t('Choose a workspace folder'),
    async () => {
      await pickWorkspaceFolder();
    },
    false,
  );
  if ((vscode.workspace.workspaceFolders ?? []).length > 1) {
    pickWorkspaceFolderStatusBar.show();
  }
  createStatusbarCommand(
    context,
    'importProject',
    '$(sign-in) ' + vscode.l10n.t('Import'),
    vscode.l10n.t('Import the RT-Thread project and generate the vscode configuration file'),
    async () => {
      const workspaceFolder = await getOrPickWorkspaceFolder();
      await doCheckAndOpenGenerateWebview(workspaceFolder.uri);
    },
    true,
  );
  let buildStatusBarItem = createStatusbarCommand(
    context,
    BUILD_TASKS.CLEAN.name,
    '$(trash) ' + vscode.l10n.t('Clean'),
    vscode.l10n.t('Full Clean'),
    async () => {
      await runBuildTaskAndHandle(BUILD_TASKS.CLEAN.name);
    },
    false,
  );
  buildStatusBarItems.push(buildStatusBarItem);
  buildStatusBarItem = createStatusbarCommand(
    context,
    BUILD_TASKS.BUILD.name,
    '$(symbol-property) ' + vscode.l10n.t('Build'),
    vscode.l10n.t('Use GCC to compile the code'),
    async () => {
      await runBuildTaskAndHandle(BUILD_TASKS.BUILD.name);
    },
    false,
  );
  buildStatusBarItems.push(buildStatusBarItem);
  buildStatusBarItem = createStatusbarCommand(
    context,
    BUILD_TASKS.DOWNLOAD.name,
    '$(zap) ' + vscode.l10n.t('Download'),
    vscode.l10n.t('Download the program using the debugger'),
    async () => {
      await runBuildTaskAndHandle(BUILD_TASKS.DOWNLOAD.name);
    },
    false,
  );
  buildStatusBarItems.push(buildStatusBarItem);
  buildStatusBarItem = createStatusbarCommand(
    context,
    BUILD_TASKS.BUILD_AND_DOWNLOAD.name,
    '$(flame) ' + vscode.l10n.t('Build and Download'),
    vscode.l10n.t('Build and download the program'),
    async () => {
      await runBuildTaskAndHandle(BUILD_TASKS.BUILD_AND_DOWNLOAD.name);
    },
    false,
  );
  buildStatusBarItems.push(buildStatusBarItem);

  // 监听makefile相关文件
  const setMakefileProcessorBuildConfig = async (workspaceFolder: vscode.WorkspaceFolder) => {
    const extensionSpecifiedBuildTask = await findTaskInTasksJson(workspaceFolder, BUILD_TASKS.BUILD.label);
    if (extensionSpecifiedBuildTask) {
      for (const startBarItem of buildStatusBarItems) {
        startBarItem.show();
      }
      await Promise.all([parseSelectedBuildConfigs(workspaceFolder.uri), parseProjcfgIni(workspaceFolder.uri)]).then(
        ([buildConfig, projcfgIni]) => {
          if (buildConfig) {
            MakefileProcessor.SetProcessConfig(workspaceFolder.uri, projcfgIni, buildConfig);
          }
        },
      );
    }
  };
  getOrPickWorkspaceFolder().then((workspaceFolder) => {
    // 初始化时如果已经导入过项目，则立即设置makefile处理器的参数
    setMakefileProcessorBuildConfig(workspaceFolder);
  });
  context.subscriptions.push(
    onWorkspaceFolderChange((workspaceFolder) => {
      setMakefileProcessorBuildConfig(workspaceFolder);
    }),
  );
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(watcher);
  context.subscriptions.push(
    watcher.onDidCreate((e) => {
      // 处理源文件对应的makefile
      MakefileProcessor.HandleFileChange(e);
    }),
  );
  context.subscriptions.push(
    watcher.onDidChange((e) => {
      // 处理外部（例如RT-Thread Studio）修改makefile
      MakefileProcessor.HandleFileChange(e);
    }),
  );
  context.subscriptions.push(
    // 处理源文件对应的makefile
    watcher.onDidDelete((e) => {
      MakefileProcessor.HandleFileChange(e);
    }),
  );

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(EXTENSION_ID)) {
        if (!e.affectsConfiguration(`${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}`)) {
          const message = vscode.l10n.t(
            'The Settings have changed and the window needs to be reloaded to apply the changes.',
          );
          const reloadAction = vscode.l10n.t('Reload Now');
          vscode.window.showInformationMessage(message, reloadAction).then((selectedAction) => {
            if (selectedAction === reloadAction) {
              vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
          });
        }
      }
    }),
  );

  // 快捷键的命令
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.action.tasks.build`, async () => {
      const workspaceFolder = await getOrPickWorkspaceFolder();
      const buildTaskName = getConfig(workspaceFolder, 'generate.defaultBuildTask', BUILD_TASKS.BUILD.name);
      await runBuildTaskAndHandle(buildTaskName);
    }),
  );

  // 诊断中断函数
  createInterruptDiagnosticAndQuickfix(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.command.diagnosticInterrupt`, async (uri: vscode.Uri) => {
      const doc = await vscode.workspace.openTextDocument(uri);
      doDiagnosticInterrupt(doc);
    }),
  );

  // 开发者命令
  if (process.env.NODE_ENV !== 'production') {
    context.subscriptions.push(
      vscode.commands.registerCommand(`${EXTENSION_ID}.command.developmentTest`, async () => {
        const workspaceFolder = await getOrPickWorkspaceFolder();
        logger.debug('workspaceFolder:', workspaceFolder);
      }),
    );
  }

  // 添加要自动清理的对象
  context.subscriptions.push(workspaceFolderChangeEmitter);
  context.subscriptions.push(buildTaskManager);
}
