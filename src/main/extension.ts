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
  setIsConfigUpdateByExtension,
  updateGlobalState,
  updateVscodeConfig,
  vscodeSettingsKeys,
  workspaceFolderChangeEmitter,
} from './base/workspace';
import { checkAndOpenGenerateWebview, onDidEnvRootChange, parseSelectedBuildConfigs } from './project/generate';
import { ExecuteTaskError, TaskNotFoundError } from './base/error';
import { TASKS, COMMANDS, CONFIG_GROUP } from './base/constants';
import { EXTENSION_ID } from '../common/constants';
import { MakefileProcessor } from './project/makefile';
import {
  buildTaskManager,
  findTaskInTasksJson,
  getBuildTaskLocked,
  runBuildTask,
  waitBuildTaskUnlocked,
} from './task/build';
import { Logger } from './base/logger';
import { createInterruptDiagnosticAndQuickfix, doDiagnosticInterrupt } from './project/diagnostic';
import { MenuConfig } from './project/menuconfig';
import { basename, dirname, join, resolve } from 'path';
import { spawn } from 'child_process';
import { existsAsync, getFileType, parseJsonFile } from './base/fs';
import { platform } from 'os';
import { debounce } from 'lodash';
import { openChangeLog } from './project/markdown';
import { AppVersion } from '../common/version';
import { getErrorMessage } from '../common/error';
import { WorkspaceFile } from './base/type';

/**
 * 日志记录器
 */
const logger = new Logger('extension');

/**
 * 构建相关的状态栏按钮
 */
const buildStatusBarItems: vscode.StatusBarItem[] = [];

/**
 * RT-Thread Env终端
 */
let rtthreadEnvTerminal: vscode.Terminal | null;

/**
 * 覆盖率写入器
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let coverageWriter: any;

/**
 * 更新软件包消抖
 */
const debouncedPkgsUpdate = debounce(
  async () => {
    await runTaskAndHandle(TASKS.PKGS_UPDATE.name);
    logger.info('run `scons --target=vsc` due to pkgs update');
    debouncedUpdateVsc();
  },
  3000,
  { leading: true, trailing: true },
);

/**
 * 更新vscode配置
 */
const debouncedUpdateVsc = debounce(
  async () => {
    const workspaceFile = vscode.workspace.workspaceFile;
    let backupSettings: WorkspaceFile['settings'] | undefined = undefined;
    if (workspaceFile) {
      const wsFolder = await getOrPickWorkspaceFolder();
      const backupUri = vscode.Uri.joinPath(wsFolder.uri, '.vscode/workspaceFile.bak');
      try {
        const json = await parseJsonFile<WorkspaceFile>(backupUri);
        backupSettings = json.settings;
        setIsConfigUpdateByExtension(true);
      } catch (error) {
        logger.debug('parseJsonFile workspaceFile.bak error', error);
      }
    }
    try {
      await runTaskAndHandle(TASKS.SCONS_TARGET_VSC.name);
    } finally {
      // FIX: 插件生成了设置，但是一调用RT-Thread的scons --target=vsc就把vscode.code-workspace清除了
      if (workspaceFile && backupSettings) {
        for (const key of vscodeSettingsKeys) {
          const v = backupSettings[key];
          if (v !== undefined) {
            await updateVscodeConfig(workspaceFile, key, v);
          }
        }
        setIsConfigUpdateByExtension(false);
      }
    }
  },
  5000,
  { leading: true, trailing: true },
);

/**
 * 提示清除构建
 */
const debouncedPromptClean = debounce(
  async () => {
    logger.debug('OnDidChangeAbsolutePathToReleative');
    const message = vscode.l10n.t(
      'You might have built it using RT-Thread Studio GCC. Do you want to run the cleanup task (to avoid problems caused by compiler inconsistency)?',
    );
    const confirmText = vscode.l10n.t('Yes');
    const selectedAction = await vscode.window.showWarningMessage(message, confirmText, vscode.l10n.t('No'));
    if (selectedAction === confirmText) {
      await runTaskAndHandle(TASKS.CLEAN.name);
    }
  },
  3000,
  { leading: false, trailing: true },
);

/**
 * 处理工作区文件增加、变化、删除。
 *
 * @param e 文件Uri
 */
function handleWorkspaceFileChange(e: vscode.Uri) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(e);
  if (!workspaceFolder) {
    return;
  }
  const projectType = getConfig(workspaceFolder, 'generate.projectType', 'RT-Thread Studio');
  if (projectType === 'RT-Thread Studio') {
    MakefileProcessor.HandleFileChange(e);
  } else {
    if (['SConscript', 'SConstruct'].includes(basename(e.fsPath))) {
      logger.info('run `scons --target=vsc` due to sconscript change');
      debouncedUpdateVsc();
    }
  }
}

/**
 * 设置扩展的when语句上下文
 */
async function setWhenContext() {
  const [cprojectUris, rtconfigPyUris] = await Promise.all([
    vscode.workspace.findFiles('.cproject'),
    vscode.workspace.findFiles('rtconfig.py'),
  ]);
  const isRtthreadProject = cprojectUris.length > 0 || rtconfigPyUris.length > 0;
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadProject`, isRtthreadProject);
  return isRtthreadProject;
}

/**
 * 更改特性配置。
 *
 * - 显示或状态栏按钮。
 *
 * - 设置扩展的when语句上下文。
 *
 * - 设置是否自动处理makefile。
 *
 * @param wsFolder 当前工作区文件夹
 * @param hasGenerateConfig 是否已经生成配置
 */
async function changeFeature(wsFolder: vscode.Uri, hasGenerateConfig: boolean) {
  const projectType = getConfig(wsFolder, 'generate.projectType', 'RT-Thread Studio');
  for (const statusbar of buildStatusBarItems) {
    if (statusbar.command === `${EXTENSION_ID}.${COMMANDS.PICK_A_WORKSPACEFOLDER}`) {
      if ((vscode.workspace.workspaceFolders ?? []).length > 1) {
        statusbar.show();
      } else {
        statusbar.hide();
      }
    } else if (statusbar.command === `${EXTENSION_ID}.${COMMANDS.MENUCONFIG}`) {
      if (projectType === 'Env' && hasGenerateConfig) {
        statusbar.show();
      } else {
        statusbar.hide();
      }
    } else if (statusbar.command !== `${EXTENSION_ID}.${COMMANDS.GENERATE_CONFIG}`) {
      if (hasGenerateConfig) {
        statusbar.show();
      } else {
        statusbar.hide();
      }
    }
  }
  const isRtthreadStudioProject = projectType === 'RT-Thread Studio';
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadEnvProject`, projectType === 'Env');
  vscode.commands.executeCommand('setContext', `${EXTENSION_ID}.isRtthreadStudioProject`, isRtthreadStudioProject);
}

/**
 * 打开生成配置面板并处理结果。
 * @param wsFolder 当前工作区文件夹
 */
async function doCheckAndOpenGenerateWebview(wsFolder: vscode.Uri) {
  await checkAndOpenGenerateWebview(wsFolder);
  await changeFeature(wsFolder, true);
  const projectType = getConfig(wsFolder, 'generate.projectType', 'RT-Thread Studio');
  if (projectType === 'Env') {
    debouncedUpdateVsc();
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
async function runTaskAndHandle(taskName: string) {
  const workspaceFolder = await getOrPickWorkspaceFolder();
  try {
    // 等待之前的任务运行完成
    if (getBuildTaskLocked()) {
      logger.info('wait for the previous tasks to complete');
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
            waitBuildTaskUnlocked()
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
 * 获取代码覆盖率（如果有插桩）
 */
function getCoverage() {
  const __coverage__ = (global as unknown as { __coverage__?: unknown }).__coverage__;
  logger.debug('__coverage__:', __coverage__);
  if (!__coverage__) {
    return;
  }
  coverageWriter.writeCoverageFile();
}

/**
 * 处理扩展被激活。
 * @param context 扩展的上下文
 */
export async function activate(context: vscode.ExtensionContext) {
  setExtensionContext(context);
  const lastVersion = new AppVersion(getGlobalState('lastVersion', '') || '');
  const thisVersion = new AppVersion(context.extension.packageJSON.version);
  logger.info('################################################################################');
  logger.info(`# activate extension, version: ${thisVersion}`);
  logger.info('################################################################################');
  if (thisVersion.gt(lastVersion)) {
    logger.info(`extension upgraded from version ${lastVersion}`);
    updateGlobalState('lastVersion', thisVersion.toString());
    if (thisVersion.isUpgradeMajor(lastVersion) || thisVersion.isUpgradeMinor(lastVersion)) {
      openChangeLog(lastVersion);
    }
  }

  // 扩展可能因为taskDefinitions贡献点被激活，添加when上下文
  const isRtthreadProject = await setWhenContext();
  if (!isRtthreadProject) {
    return;
  }

  // 创建状态栏按钮
  const pickAWorkspaceFolderStatusBar = createStatusbarCommand(
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
  if ((vscode.workspace.workspaceFolders ?? []).length > 1) {
    pickAWorkspaceFolderStatusBar.show();
  }
  createStatusbarCommand(
    context,
    COMMANDS.GENERATE_CONFIG,
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
        });
        rtthreadEnvTerminal.sendText(`chcp 437`);
      } else {
        rtthreadEnvTerminal = vscode.window.createTerminal({
          name: 'RT-Thread Env',
        });
      }
      rtthreadEnvTerminal.show();
      context.subscriptions.push(
        vscode.window.onDidCloseTerminal((closedTerminal) => {
          if (closedTerminal === rtthreadEnvTerminal) {
            rtthreadEnvTerminal = null;
          }
        }),
      );
    },
    false,
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.${COMMANDS.OPEN_CONEMU}`, async (uri: vscode.Uri) => {
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
      const ConEmuExe = join(envPath, 'tools', 'ConEmu', 'ConEmu64.exe');
      if (!(await existsAsync(ConEmuExe))) {
        vscode.window.showErrorMessage(vscode.l10n.t('The path \"{0}\" does not exists', [ConEmuExe]));
      }
      spawn(ConEmuExe, [], { cwd });
    }),
  );
  context.subscriptions.push(
    onDidEnvRootChange(async () => {
      const terminals = vscode.window.terminals;
      terminals.forEach((terminal) => terminal.dispose());
      MenuConfig.Dispose();
      const workspaceFolder = await getOrPickWorkspaceFolder();
      const sconsignFilePath = vscode.Uri.joinPath(workspaceFolder.uri, '.sconsign.dblite');
      if (await existsAsync(sconsignFilePath)) {
        await vscode.workspace.fs.delete(sconsignFilePath, { useTrash: false });
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.${COMMANDS.OPEN_CHANGELOG}`, async () => {
      await openChangeLog();
    }),
  );

  // 处理选择的工作区发生变更
  const handleWorkspaceFolderChanged = async (workspaceFolder: vscode.WorkspaceFolder) => {
    let extensionSpecifiedBuildTask;
    const projectType = getConfig(workspaceFolder.uri, 'generate.projectType', 'RT-Thread Studio');
    try {
      extensionSpecifiedBuildTask = await findTaskInTasksJson(workspaceFolder, TASKS.BUILD.label);
      if (projectType === 'RT-Thread Studio') {
        MakefileProcessor.SetHasBuildConfig(false);
        if (extensionSpecifiedBuildTask) {
          const buildConfig = await parseSelectedBuildConfigs(workspaceFolder.uri);
          if (buildConfig) {
            await MakefileProcessor.SetProcessConfig(workspaceFolder.uri, buildConfig);
          }
          MakefileProcessor.SetHasBuildConfig(true);
        }
      }
    } catch (error: unknown) {
      logger.debug('set MakefileProcessor config error:', getErrorMessage(error));
    } finally {
      await changeFeature(workspaceFolder.uri, !!extensionSpecifiedBuildTask);
    }
  };
  getOrPickWorkspaceFolder().then((workspaceFolder) => {
    // 初始化时如果已经导入过项目，则立即设置makefile处理器的参数
    handleWorkspaceFolderChanged(workspaceFolder);
  });
  context.subscriptions.push(
    onWorkspaceFolderChange((workspaceFolder) => {
      handleWorkspaceFolderChanged(workspaceFolder);
      MenuConfig.Dispose();
      const terminals = vscode.window.terminals;
      terminals.forEach((terminal) => terminal.dispose());
    }),
  );

  // 监听文件变化
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  context.subscriptions.push(watcher);
  context.subscriptions.push(
    watcher.onDidCreate((e) => {
      handleWorkspaceFileChange(e);
    }),
  );
  context.subscriptions.push(
    watcher.onDidChange((e) => {
      handleWorkspaceFileChange(e);
    }),
  );
  context.subscriptions.push(
    watcher.onDidDelete((e) => {
      handleWorkspaceFileChange(e);
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.command.AddIncludePath`, async (uri: vscode.Uri) => {
      MakefileProcessor.AddIncludePaths([uri.fsPath]);
    }),
  );
  context.subscriptions.push(
    MakefileProcessor.OnDidChangeAbsolutePathToReleative(async () => {
      const workspaceFolder = await getOrPickWorkspaceFolder();
      if (getConfig(workspaceFolder, 'makefileProcessor.promptCleanWhenBuildByStudio', true)) {
        debouncedPromptClean();
      }
    }),
  );

  // 监听vscode设置变化
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
          const confirmText = vscode.l10n.t('Yes');
          const selectedAction = await vscode.window.showWarningMessage(message, confirmText, vscode.l10n.t('No'));
          if (selectedAction === confirmText) {
            const workspaceFolder = await getOrPickWorkspaceFolder();
            await doCheckAndOpenGenerateWebview(workspaceFolder.uri);
          }
        } else {
          const message = vscode.l10n.t(
            'The Settings have changed and the window needs to be reloaded to apply the changes.',
          );
          const confirmText = vscode.l10n.t('Reload Now');
          vscode.window.showInformationMessage(message, confirmText).then((selectedAction) => {
            if (selectedAction === confirmText) {
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

  // 开发者操作
  if (process.env.NODE_ENV !== 'production') {
    context.subscriptions.push(
      vscode.commands.registerCommand(`${EXTENSION_ID}.command.developmentTest`, async () => {}),
    );

    let extensionPath = resolve(__dirname, '../..');
    if (/^[a-zA-Z]:[\\/]/.test(extensionPath)) {
      extensionPath = extensionPath[0].toUpperCase() + extensionPath.slice(1);
    }
    const nyc = await import('nyc');
    logger.debug('nyc:', nyc);
    coverageWriter = new nyc({
      all: true,
      cwd: extensionPath,
      reporter: ['lcov', 'text-summary'],
      reportDir: resolve(extensionPath, 'coverage/main/coverage'),
      tempDirectory: resolve(extensionPath, 'coverage/main/.nyc_output'),
    });
  }

  // 添加要自动清理的对象
  context.subscriptions.push(workspaceFolderChangeEmitter);
  context.subscriptions.push(buildTaskManager);
}

/**
 * 处理扩展被禁用或关闭
 */
export function deactivate() {
  rtthreadEnvTerminal?.dispose();
  MenuConfig.Dispose();
  MakefileProcessor.Dispose();
  if (process.env.NODE_ENV !== 'production') {
    getCoverage();
  }
}
