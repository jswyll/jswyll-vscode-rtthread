import * as vscode from 'vscode';
import {
  getConfig,
  getGlobalState,
  getIsConfigUpdateByExtension,
  getOrPickAWorkspaceFolder as getOrPickWorkspaceFolder,
  onWorkspaceFolderChange,
  parsePath,
  pickWorkspaceFolder,
  setExtensionContext,
  updateGlobalState,
  workspaceFolderChangeEmitter,
} from './base/workspace';
import {
  checkAndOpenGenerateWebview,
  onDidEnvRootChange,
  parseProjcfgIni,
  parseSelectedBuildConfigs,
} from './project/generate';
import { ExecuteTaskError, TaskNotFoundError } from './base/error';
import { TASKS, COMMANDS, CONFIG_GROUP } from './base/constants';
import { EXTENSION_ID } from '../common/constants';
import { MakefileProcessor } from './project/makefile';
import { buildTaskManager, findTaskInTasksJson, runBuildTask } from './task/build';
import { Logger } from './base/logger';
import { createInterruptDiagnosticAndQuickfix, doDiagnosticInterrupt } from './project/diagnostic';
import { MenuConfig } from './project/menuconfig';
import { dirname, join } from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { getFileType } from './base/fs';
import { platform } from 'os';
import { debounce } from 'lodash';

/**
 * 日志记录器
 */
const logger = new Logger('extension');

/**
 * 构建相关的状态栏按钮
 */
const buildStatusBarItems: vscode.StatusBarItem[] = [];

/**
 * ConEmu进程
 */
let conEmuProcess: ChildProcessWithoutNullStreams | null;

/**
 * RT-Thread Env终端
 */
let rtthreadEnvTerminal: vscode.Terminal | null;

/**
 * 更新软件包消抖
 */
const debouncedPkgsUpdate = debounce(
  async () => {
    await runTaskAndHandle(TASKS.PKGS_UPDATE.name);
  },
  3000,
  { leading: true, trailing: true },
);

/**
 * 设置扩展的when语句上下文
 */
async function setWhenContext() {
  // TODO: 添加更精确的判断
  const [cprojectUris, rtconfigPyUris] = await Promise.all([
    vscode.workspace.findFiles('.cproject'),
    // TODO: 支持子目录？
    vscode.workspace.findFiles('rtconfig.py'),
  ]);
  const isRtthreadProject = cprojectUris.length > 0 || rtconfigPyUris.length > 0;
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadProject`, isRtthreadProject);
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadEnvProject`, rtconfigPyUris.length > 0);
  return isRtthreadProject;
}

/**
 * 根据配置情况显示或隐藏各个状态栏及右键菜单。
 * @param wsFolder 当前工作区文件夹
 */
function changeShowStatusBars(wsFolder: vscode.Uri) {
  const projectType = getConfig(wsFolder, 'generate.projectType', 'RT-Thread Studio');
  for (const statusbar of buildStatusBarItems) {
    if (statusbar.command === `${EXTENSION_ID}.${COMMANDS.MENUCONFIG}`) {
      if (projectType === 'Env') {
        statusbar.show();
      } else {
        statusbar.hide();
      }
    } else if (statusbar.command === `${EXTENSION_ID}.${COMMANDS.PICK_A_WORKSPACEFOLDER}`) {
      if ((vscode.workspace.workspaceFolders ?? []).length > 1) {
        statusbar.show();
      } else {
        statusbar.hide();
      }
    } else {
      statusbar.show();
    }
  }
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadEnvProject`, projectType === 'Env');
}

/**
 * 打开生成配置面板并处理结果。
 * @param wsFolder 当前工作区文件夹
 */
async function doCheckAndOpenGenerateWebview(wsFolder: vscode.Uri) {
  await checkAndOpenGenerateWebview(wsFolder);
  changeShowStatusBars(wsFolder);
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
async function runTaskAndHandle(taskName: string) {
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
      await runTaskAndHandle(taskName);
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
 * @param icon 形如`$(name)`的图标文本
 * @param title 按钮显示的文本
 * @param tooltip 悬停的提示
 * @param priority 按钮的优先级，最大越靠左
 * @param onClick 点击按钮时的回调函数
 * @param isShow 初始时是否显示
 */
function createStatusbarCommand(
  context: vscode.ExtensionContext,
  command: string,
  icon: string,
  title: string,
  tooltip: string,
  priority: number,
  onClick: () => Thenable<void>,
  isShow: boolean,
) {
  const cmd = `${EXTENSION_ID}.${command}`;
  const showStatusBarTitle = getConfig(null, 'appearance.showStatusBarTitle', true);
  const text = showStatusBarTitle ? `${icon} ${title}` : icon;
  context.subscriptions.push(vscode.commands.registerCommand(cmd, onClick));
  const statusBarItem = vscode.window.createStatusBarItem(command, vscode.StatusBarAlignment.Left, priority);
  statusBarItem.command = cmd;
  statusBarItem.text = text;
  statusBarItem.tooltip = `${EXTENSION_ID} - ${tooltip}`;
  if (isShow) {
    statusBarItem.show();
  }
  context.subscriptions.push(statusBarItem);
  buildStatusBarItems.push(statusBarItem);
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
  const isRtthreadProject = await setWhenContext();
  if (!isRtthreadProject) {
    return;
  }

  // 创建状态栏按钮
  createStatusbarCommand(
    context,
    COMMANDS.PICK_A_WORKSPACEFOLDER,
    '$(file-submodule)',
    '',
    vscode.l10n.t('Choose a workspace folder'),
    100,
    async () => {
      await pickWorkspaceFolder();
    },
    false,
  );
  createStatusbarCommand(
    context,
    'action.generateConfig',
    '$(sign-in)',
    vscode.l10n.t('Import'),
    vscode.l10n.t('Import the RT-Thread project and generate the vscode configuration file'),
    99,
    async () => {
      const workspaceFolder = await getOrPickWorkspaceFolder();
      await doCheckAndOpenGenerateWebview(workspaceFolder.uri);
    },
    true,
  );
  createStatusbarCommand(
    context,
    COMMANDS.MENUCONFIG,
    '$(gear)',
    vscode.l10n.t('Config'),
    vscode.l10n.t('Menuconfig'),
    98,
    async () => {
      const workspaceFolder = await getOrPickWorkspaceFolder();
      MenuConfig.CreateOrOpenPanel(workspaceFolder.uri);
      if (getConfig(workspaceFolder.uri, 'RttEnv.autoUpdatePackages', true)) {
        context.subscriptions.push(
          MenuConfig.onDidSaveMenuconfig(async () => {
            debouncedPkgsUpdate();
          }),
        );
      }
    },
    false,
  );
  createStatusbarCommand(
    context,
    TASKS.CLEAN.name,
    '$(trash)',
    vscode.l10n.t('Clean'),
    vscode.l10n.t('Full Clean'),
    97,
    async () => {
      await runTaskAndHandle(TASKS.CLEAN.name);
    },
    false,
  );
  createStatusbarCommand(
    context,
    TASKS.BUILD.name,
    '$(symbol-property)',
    vscode.l10n.t('Build'),
    vscode.l10n.t('Use GCC to compile the code'),
    96,
    async () => {
      await runTaskAndHandle(TASKS.BUILD.name);
    },
    false,
  );
  createStatusbarCommand(
    context,
    TASKS.DOWNLOAD.name,
    '$(zap)',
    vscode.l10n.t('Download'),
    vscode.l10n.t('Download the program using the debugger'),
    95,
    async () => {
      await runTaskAndHandle(TASKS.DOWNLOAD.name);
    },
    false,
  );
  createStatusbarCommand(
    context,
    TASKS.BUILD_AND_DOWNLOAD.name,
    '$(flame)',
    vscode.l10n.t('Build and Download'),
    vscode.l10n.t('Build and download the program'),
    94,
    async () => {
      await runTaskAndHandle(TASKS.BUILD_AND_DOWNLOAD.name);
    },
    false,
  );
  createStatusbarCommand(
    context,
    COMMANDS.OPEN_TERMINAL,
    '$(terminal)',
    vscode.l10n.t('Terminal'),
    vscode.l10n.t('Open ConEmu'),
    93,
    async () => {
      if (platform() === 'win32') {
        rtthreadEnvTerminal = vscode.window.createTerminal({
          name: 'RT-Thread Env',
          shellPath: 'cmd.exe',
          shellArgs: ['/K', 'chcp 437'],
        });
        rtthreadEnvTerminal.show();
        context.subscriptions.push(
          vscode.window.onDidCloseTerminal((closedTerminal) => {
            if (closedTerminal === rtthreadEnvTerminal) {
              rtthreadEnvTerminal = null;
            }
          }),
        );
      } else {
        // TODO: 其它平台
        throw new Error(vscode.l10n.t('Not implemented'));
      }
    },
    false,
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.${COMMANDS.OPEN_CONEMU}`, async (uri: vscode.Uri) => {
      if (platform() === 'win32') {
        const workspaceFolder = await getOrPickWorkspaceFolder();
        const fileType = await getFileType(uri);
        let cwd: string;
        if (fileType === vscode.FileType.Directory) {
          cwd = uri.fsPath;
        } else if (fileType === vscode.FileType.File) {
          cwd = dirname(uri.fsPath);
        } else {
          cwd = workspaceFolder.uri.fsPath;
        }
        const envPath = parsePath(getConfig(workspaceFolder, 'generate.envPath', ''));
        const ConEmuExe = join(envPath, 'tools', 'ConEmu', 'ConEmu64');
        conEmuProcess = spawn(ConEmuExe, [], { cwd });
        conEmuProcess.on('close', () => {
          conEmuProcess = null;
        });
      } else {
        // TODO: 其它平台
        throw new Error(vscode.l10n.t('Not implemented'));
      }
    }),
  );
  context.subscriptions.push(
    onDidEnvRootChange(() => {
      const terminals = vscode.window.terminals;
      terminals.forEach((terminal) => terminal.dispose());
      conEmuProcess?.kill();
      MenuConfig.Dispose();
    }),
  );

  // 监听makefile相关文件
  const setMakefileProcessorBuildConfig = async (workspaceFolder: vscode.WorkspaceFolder) => {
    const extensionSpecifiedBuildTask = await findTaskInTasksJson(workspaceFolder, TASKS.BUILD.label);
    if (extensionSpecifiedBuildTask) {
      changeShowStatusBars(workspaceFolder.uri);
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
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.command.AddIncludePath`, async (uri: vscode.Uri) => {
      MakefileProcessor.AddIncludePaths([uri.fsPath]);
    }),
  );

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(EXTENSION_ID)) {
        if (getIsConfigUpdateByExtension()) {
          return;
        }
        if (e.affectsConfiguration(`${EXTENSION_ID}.${CONFIG_GROUP.GENERATE}`)) {
          const message = vscode.l10n.t(
            "It won't work until the next time you import it, so do you want to do it again?",
          );
          const confirmAction = vscode.l10n.t('Yes');
          const selectedAction = await vscode.window.showWarningMessage(message, confirmAction, vscode.l10n.t('No'));
          if (selectedAction === confirmAction) {
            const workspaceFolder = await getOrPickWorkspaceFolder();
            await doCheckAndOpenGenerateWebview(workspaceFolder.uri);
          }
        } else {
          const message = vscode.l10n.t(
            'The Settings have changed and the window needs to be reloaded to apply the changes.',
          );
          const confirmAction = vscode.l10n.t('Reload Now');
          vscode.window.showInformationMessage(message, confirmAction).then((selectedAction) => {
            if (selectedAction === confirmAction) {
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
      const buildTaskName = getConfig(workspaceFolder, 'generate.defaultBuildTask', TASKS.BUILD.name);
      await runTaskAndHandle(buildTaskName);
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

/**
 * 处理扩展被禁用或关闭
 */
export function deactivate() {
  conEmuProcess?.kill();
  rtthreadEnvTerminal?.dispose();
  MenuConfig.Dispose();
}
