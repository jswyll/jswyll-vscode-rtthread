import * as vscode from 'vscode';
import { BUILD_TASKS_LABEL_PREFIX, EXTENSION_ID } from '../../common/constants';

/**
 * tasks.json的与工作区文件夹的相对路径
 */
export const TASKS_JSON_RELATIVE_PATH = '.vscode/tasks.json';

/**
 * make的问题匹配器的名称
 */
export const MAKE_PROBLEM_MATCHER_NAME = `$${EXTENSION_ID}-make`;

/**
 * GCC编译的问题匹配器的名称
 */
export const GCC_COMPILE_PROBLEM_MATCHER_NAME = `$${EXTENSION_ID}-gcc-compile`;

/**
 * GCC链接的问题匹配器的名称
 */
export const GCC_LINK_PROBLEM_MATCHER_NAME = `$${EXTENSION_ID}-gcc-link`;

/**
 * 扩展命令名称（不含`${EXTENSION_ID}.`前缀）
 */
export const COMMANDS = {
  /**
   * 选择工作区文件夹
   */
  PICK_A_WORKSPACEFOLDER: 'pickAWorkspaceFolder',

  /**
   * 打开或显示菜单配置
   */
  MENUCONFIG: 'action.menuconfig.open',

  /**
   * 打开终端
   */
  OPEN_TERMINAL: 'action.terminal.open',

  /**
   * 打开ConEmu
   */
  OPEN_CONEMU: 'action.ConEmu.open',

  /**
   * 打开更新日志
   */
  OPEN_CHANGELOG: 'action.changelog.open',
};

/**
 * 任务，其中每一项的属性意义：
 *
 * - `name` 基本的任务名称，点击状态栏按钮时优先匹配用户定义的此名称，匹配不到时再匹配扩展定义的
 *
 * - `label` 任务标签，和tasks.json中的label对应
 *
 * - `detail` 任务的本地化描述，和tasks.json中的detail对应
 */
export const TASKS = {
  /**
   * 更新软件包
   */
  PKGS_UPDATE: {
    name: 'pkgs --update',
    label: BUILD_TASKS_LABEL_PREFIX + 'pkgs --update',
    detail: vscode.l10n.t('Update Packages'),
  },

  /**
   * 生成vscode配置
   */
  SCONS_TARGET_VSC: {
    name: 'scons --target=vsc',
    label: BUILD_TASKS_LABEL_PREFIX + 'scons --target=vsc',
    detail: vscode.l10n.t('Generate VSCode Workspace'),
  },

  /**
   * 构建
   */
  BUILD: {
    name: 'build',
    label: BUILD_TASKS_LABEL_PREFIX + 'build',
    detail: vscode.l10n.t('Build'),
  },

  /**
   * 下载
   */
  DOWNLOAD: {
    name: 'download',
    label: BUILD_TASKS_LABEL_PREFIX + 'download',
    detail: vscode.l10n.t('Download'),
  },

  /**
   * 构建并下载
   */
  BUILD_AND_DOWNLOAD: {
    name: 'build and download',
    label: BUILD_TASKS_LABEL_PREFIX + 'build and download',
    detail: vscode.l10n.t('Build and Download'),
  },

  /**
   * 清除
   */
  CLEAN: {
    name: 'clean',
    label: BUILD_TASKS_LABEL_PREFIX + 'clean',
    detail: vscode.l10n.t('Clean'),
  },

  /**
   * 重新构建
   */
  REBUILD: {
    name: 'rebuild',
    label: BUILD_TASKS_LABEL_PREFIX + 'rebuild',
    detail: vscode.l10n.t('Rebuild'),
  },

  /**
   * 监视
   */
  MONIT: {
    name: 'monit',
    label: BUILD_TASKS_LABEL_PREFIX + 'monit',
    detail: vscode.l10n.t('Monit'),
  },
} as const;

/**
 * 构建任务的类型
 */
export type BuildTaskName = (typeof TASKS)[keyof typeof TASKS]['name'];

/**
 * 扩展设置组的前缀
 */
export const CONFIG_GROUP = {
  /**
   * makefile处理
   */
  MAKEFILE_PROCESSOR: 'makefileProcessor',

  /**
   * 自动诊断中断
   */
  INTERRUPT_DIAGNOSTIC: 'autoDiagnosticInterrupt',

  /**
   * 生成
   */
  GENERATE: 'generate',

  /**
   * RT-Thread Env
   */
  RTT_ENV: 'RttEnv',

  /**
   * 外观
   */
  APPEARANCE: 'appearance',
} as const;
