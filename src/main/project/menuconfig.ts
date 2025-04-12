import * as vscode from 'vscode';
import { WebviewPanel } from '../base/webview';
import { EXTENSION_ID } from '../../common/constants';
import { TMenuItem } from '../../common/types/menuconfig';
import * as kconfiglib from '../kconfig/kconfiglib';
import { join } from 'path';
import { Logger } from '../base/logger';
import { existsAsync, readTextFile, writeTextFile } from '../base/fs';
import { getVscodeConfig, parsePath } from '../base/workspace';
import { isAbsolutePath } from '../../common/platform';
import { platform } from 'os';
import { MenuTreeBuilder } from '../kconfig/tree';

/**
 * 日志记录器
 */
const logger = new Logger('main/project/menuconfig');

function isYModeChoiceSym(item: unknown): boolean {
  return item instanceof kconfiglib.Sym && item.choice !== null && item.visibility === 2;
}

/**
 * 检查节点是否为可以更改值的 Sym 或 Choice 类型。
 *
 * @param node 要检查的节点。
 * @returns 如果节点的值可以更改，则返回 true；否则返回 false。
 */
function changeable(node: kconfiglib.MenuNode): boolean {
  const sc = node.item as kconfiglib.Sym | kconfiglib.Choice;

  if (!kconfiglib.isSymbolOrChoice(sc)) {
    return false;
  }

  if (!node.prompt || !kconfiglib.expr_value(node.prompt[1])) {
    return false;
  }

  return (
    [kconfiglib.STRING, kconfiglib.INT, kconfiglib.HEX].includes(sc.orig_type) ||
    sc.assignable.length > 1 ||
    isYModeChoiceSym(sc)
  );
}

/**
 * 将节点的值更改为指定的字符串值。
 *
 * @param node 要更改值的节点。
 * @param strValue 要设置为节点值的字符串。
 * @returns 如果值成功更改，则返回 true；否则返回 false。
 */
function changeNode(node: kconfiglib.MenuNode | undefined, strValue: string): boolean {
  if (!node || !changeable(node)) {
    return false;
  }
  const sc = node.item as kconfiglib.Sym | kconfiglib.Choice;
  let result = false;
  if ([kconfiglib.STRING, kconfiglib.INT, kconfiglib.HEX].includes(sc.orig_type)) {
    result = sc.set_value(strValue);
  } else if (sc.assignable.length === 1) {
    result = sc.set_value(sc.assignable[0]);
  } else {
    const valIndex = sc.assignable.indexOf(sc.bool_value);
    result = sc.set_value(sc.assignable[(valIndex + 1) % sc.assignable.length]);
  }
  return result;
}

/**
 * 判断加载的 `.config` 文件是否已过时，是否需要保存。
 *
 * @returns 如果文件已过时且在保存时会被修改，则返回 True；否则返回 False。
 */
function isNeedsSave(kconfig: kconfiglib.Kconfig): boolean {
  if (kconfig.missing_syms.length > 0) {
    return true;
  }

  for (const sym of kconfig.unique_defined_syms) {
    if (sym._user_value === null || sym._user_value === undefined) {
      if (sym.config_string) {
        return true;
      }
    } else if ([kconfiglib.BOOL, kconfiglib.TRISTATE].includes(sym.orig_type)) {
      if (sym.bool_value !== sym._user_value) {
        return true;
      }
    } else if (sym.str_value !== sym._user_value) {
      return true;
    }
  }

  return false;
}

/**
 * 菜单配置
 */
export class MenuConfig {
  /**
   * webview面板
   */
  private static webviewPanel: WebviewPanel | null;

  /**
   * kconfig对象
   */
  private static kconfig: kconfiglib.Kconfig;

  /**
   * 菜单树构造器
   */
  private static menuTreeBuilder: MenuTreeBuilder | null;

  /**
   * 是否有改动，需要保存
   */
  private static hasChanged = false;

  /**
   * 已经保存菜单配置的发射器
   */
  private static saveMenuconfigEmitter = new vscode.EventEmitter<void>();

  /**
   * 检查字符串是否以“PKG_”开头，以“_PATH”或“_VER”结尾。
   */
  private static IsPkgSpecialConfig(configStr: string): boolean {
    if (typeof configStr === 'string') {
      if (configStr.startsWith('PKG_') && (configStr.endsWith('_PATH') || configStr.endsWith('_VER'))) {
        return true;
      }
    }
    return false;
  }

  /**
   * 根据配置写入`rtconfig.h`
   */
  private static async WriteRtconfigHeader(wsFolder: vscode.Uri) {
    logger.info('generate rtconfig.h from .config');
    const configFileUri = vscode.Uri.joinPath(wsFolder, '.config');
    const configContent = await readTextFile(configFileUri);
    let targetFile = 'rtconfig.h';
    const match = configContent.match(/^CONFIG_TARGET_FILE.*?=(.*)/m);
    if (match) {
      targetFile = match[1].trim();
      if (targetFile.startsWith('"') && targetFile.endsWith('"')) {
        targetFile = targetFile.substring(1, targetFile.length - 1);
      }
    }
    let rtconfigContent = '#ifndef RT_CONFIG_H__\n';
    rtconfigContent += '#define RT_CONFIG_H__\n\n';
    let emptyLine = 1;
    const configLines = configContent.split(/\r?\n/);
    for (let line of configLines) {
      line = line.trim();
      if (line === '') {
        continue;
      }

      if (line[0] === '#') {
        if (line.length === 1) {
          if (emptyLine) {
            continue;
          }

          rtconfigContent += '\n';
          emptyLine = 1;
          continue;
        }

        if (line.startsWith('# CONFIG_')) {
          line = ' ' + line.substring(9);
        } else {
          line = line.substring(1);
          rtconfigContent += `/*${line} */\n`;
        }

        emptyLine = 0;
      } else {
        emptyLine = 0;
        const setting = line.split('=');
        if (setting.length === 2) {
          if (setting[0].startsWith('CONFIG_')) {
            setting[0] = setting[0].substring(7);
          }

          if (this.IsPkgSpecialConfig(setting[0])) {
            continue;
          }

          if (setting[1] === 'y') {
            rtconfigContent += `#define ${setting[0]}\n`;
          } else {
            rtconfigContent += `#define ${setting[0]} ${setting[1]}\n`;
          }
        }
      }
    }

    if (await existsAsync(vscode.Uri.joinPath(wsFolder, 'rtconfig_project.h'))) {
      rtconfigContent += '#include "rtconfig_project.h"';
    }
    rtconfigContent += '\n';
    rtconfigContent += '#endif\n';
    writeTextFile(vscode.Uri.joinPath(wsFolder, targetFile), rtconfigContent);
  }

  /**
   * 创建或打开面板
   * @param wsFolder 工作区文件夹
   */
  public static CreateOrOpenPanel(wsFolder: vscode.Uri) {
    if (this.webviewPanel && !this.webviewPanel.isDisposed) {
      this.webviewPanel.show();
      return;
    }
    this.saveMenuconfigEmitter.dispose();
    this.saveMenuconfigEmitter = new vscode.EventEmitter<void>();
    this.onDidSaveMenuconfig = this.saveMenuconfigEmitter.event;
    vscode.commands.executeCommand('workbench.action.closePanel');
    this.webviewPanel = new WebviewPanel(`${EXTENSION_ID}-menuConfig`, vscode.l10n.t('Menuconfig'), '/view/menuconfig');
    this.webviewPanel.onDidReceiveMessage = async (msg) => {
      switch (msg.command) {
        case 'getMenuconfigData': {
          process.env.srctree = wsFolder.fsPath;
          const osPlatform = platform();
          let envVars: Record<string, string>;
          if (osPlatform === 'win32') {
            envVars = getVscodeConfig(wsFolder, 'terminal.integrated.env.windows', {});
          } else if (osPlatform === 'darwin') {
            envVars = getVscodeConfig(wsFolder, 'terminal.integrated.env.osx', {});
          } else {
            envVars = getVscodeConfig(wsFolder, 'terminal.integrated.env.linux', {});
          }
          for (const key in envVars) {
            if (key === 'PATH') {
              continue;
            }
            let p = parsePath(envVars[key]);
            if (!isAbsolutePath(p) && ['BSP_ROOT', 'BSP_DIR', 'RTT_ROOT', 'RTT_DIR'].includes(key)) {
              p = join(wsFolder.fsPath, p);
            }
            process.env[key] = p;
          }
          // 新版Env2.x的SDK所需环境变量
          process.env['HOSTOS'] = platform() === 'win32' ? 'Windows' : 'Linux';

          this.kconfig = new kconfiglib.Kconfig({
            filename: 'Kconfig',
            warn: true,
            info: false,
            warn_to_stderr: false,
            verbose: false,
          });
          this.kconfig.load_config();
          logger.warn('this.kconfig.warnings:', this.kconfig.warnings);
          this.hasChanged = isNeedsSave(this.kconfig);
          this.menuTreeBuilder = new MenuTreeBuilder(this.kconfig);
          const menus: TMenuItem[] = this.menuTreeBuilder.build();
          this.webviewPanel?.postMessage({
            command: msg.command,
            params: {
              menus,
              hasChanged: this.hasChanged,
              warnings: this.kconfig.warnings,
            },
          });
          break;
        }

        case 'changeMenuItem': {
          const { id, value } = msg.params;
          const node = this.menuTreeBuilder!.idToNodeMap[id];
          if (kconfiglib.isSymbolOrChoice(node?.item)) {
            let strValue = String(value);
            if (typeof value === 'boolean') {
              strValue = value ? 'y' : 'n';
            }
            const result = changeNode(node, strValue);
            if (result) {
              const menus: TMenuItem[] = this.menuTreeBuilder!.build();
              this.hasChanged = true;
              this.webviewPanel?.postMessage({
                command: 'setMenuconfigData',
                params: menus,
              });
            }
            this.webviewPanel?.postMessage({
              command: msg.command,
              params: { result },
            });
          }
          break;
        }

        case 'saveMenuconfig': {
          const message = this.kconfig.write_config(join(wsFolder.fsPath, kconfiglib.standard_config_filename()));
          await this.WriteRtconfigHeader(wsFolder);
          this.webviewPanel?.postMessage({
            command: msg.command,
            params: { message },
          });
          this.saveMenuconfigEmitter.fire();
          break;
        }

        default:
          break;
      }
    };
  }

  /**
   * 监听事件 - 已保存菜单配置
   */
  public static onDidSaveMenuconfig = this.saveMenuconfigEmitter.event;

  /**
   * 销毁
   */
  public static Dispose() {
    // TODO: 被关闭时如果未保存则提示保存
    this.webviewPanel?.dispose();
    this.saveMenuconfigEmitter.dispose();
  }
}
