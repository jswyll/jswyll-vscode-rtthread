import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { SpawnError } from './error';
import { Logger } from './logger';

/**
 * spawnPromise的选项
 */
interface spawnPromiseOptions extends SpawnOptionsWithoutStdio {
  /**
   * 退出代码不为0时解析Promise，默认为false
   */
  resolveWhenExitCodeNotZero?: boolean;

  /**
   * 收到stdout的回调函数
   */
  onStdOut?: (data: Buffer) => void;

  /**
   * 收到stderr的回调函数
   */
  onStdErr?: (data: Buffer) => void;
}

/**
 * 日志记录器
 */
const logger = new Logger('main/base/process');

/**
 * 以异步方式执行命令。
 * @param command 命令
 * @param args 参数
 * @param options 选项 {@link spawnPromiseOptions}
 * @returns 一个包含stdout和stderr的对象的Promise，其中stdout或stderr没有输出时为空字符串
 * @throws 监听到错误或者进程退出代码不为0且{@link spawnPromiseOptions.resolveWhenExitCodeNotZero}不为true时
 * 抛出{@link SpawnError}
 */
export function spawnPromise(command: string, args: string[] = [], options: spawnPromiseOptions = {}) {
  return new Promise<{
    /**
     * stdout输出
     */
    stdout: string;
    /**
     * stderr输出
     */
    stderr: string;
  }>((resolve, reject) => {
    const commandLine = `${command} ${args.join(' ')}`;
    logger.debug(`child_process: "${commandLine}"`);
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      options.onStdOut?.(data);
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      options.onStdErr?.(data);
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (stdout) {
        logger.debug(`stdout of command "${commandLine}":\r\n${stdout}`);
      }
      if (stderr) {
        logger.debug(`stderr of command "${commandLine}":\r\n${stderr}`);
      }
      if (code === 0 || options.resolveWhenExitCodeNotZero) {
        resolve({ stdout, stderr });
      } else {
        reject(new SpawnError(`Command of "${commandLine}" failed with exit code ${code}: ${stderr}`, stdout, stderr));
      }
    });
    child.on('error', (error) => {
      const message = `An error occurred while exec "${commandLine}": ${error.message}`;
      logger.error(message);
      reject(new SpawnError(message, stdout, stderr));
    });
  });
}
