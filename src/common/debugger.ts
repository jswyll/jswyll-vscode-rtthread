import { basenameWithoutExt } from './platform';

/**
 * 支持的调试服务器
 */
export const supportedDebugServer = ['openocd', 'pyocd', 'jlink', 'stlink'] as const;

/**
 * 支持的调试服务器类型
 */
export declare type SupportedDebugServer = (typeof supportedDebugServer)[number];

/**
 * 获取用于cortex-debug的调试服务器的类型
 * @param debuggerServerPath 绝对路径或基本名
 * @returns 已支持的{@link supportedDebugServer}，或返回`undefined`
 */
export function getDebugServerType(debuggerServerPath: string): SupportedDebugServer | undefined {
  let baseName = basenameWithoutExt(debuggerServerPath).toLowerCase();
  if (baseName === 'jlinkexe') {
    baseName = 'jlink';
  } else if (baseName === 'st-link_gdbserver') {
    baseName = 'stlink';
  }
  if (!supportedDebugServer.includes(baseName as SupportedDebugServer)) {
    return undefined;
  }
  return baseName as SupportedDebugServer;
}
