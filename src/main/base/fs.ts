import * as vscode from 'vscode';
import { getErrorMessage } from '../../common/error';
import { parse } from 'jsonc-parser';
import { Logger } from './logger';

/**
 * 日志记录器
 */
const logger = new Logger('main/base/fs');

/**
 * 以异步方式判断文件或文件夹是否存在（不存在时不抛出错误）。
 *
 * @param pathOrUri 文件的绝对路径路径或uri
 * @returns 是否存在
 */
export async function existsAsync(pathOrUri: string | vscode.Uri) {
  try {
    if (typeof pathOrUri === 'string') {
      pathOrUri = vscode.Uri.file(pathOrUri);
    }
    await vscode.workspace.fs.stat(pathOrUri);
    return true;
  } catch (error) {
    logger.error(error);
    return false;
  }
}

/**
 * 获取文件类型，文件不存在时不抛出异常且返回{@link vscode.FileType.Unknown}。
 * @param uri 文件uri
 * @returns 文件类型
 */
export async function getFileType(pathOrUri: string | vscode.Uri): Promise<vscode.FileType> {
  try {
    if (typeof pathOrUri === 'string') {
      pathOrUri = vscode.Uri.file(pathOrUri);
    }
    const stat = await vscode.workspace.fs.stat(pathOrUri);
    return stat.type;
  } catch {
    return vscode.FileType.Unknown;
  }
}

/**
 * 读取文本文件。
 * @param uri 文件uri
 * @param defaultValue 读取失败时返回的默认文本
 * @returns 文件内容
 * @throws 读取失败且未传入defaultValue参数时抛出{@link Error}
 */
export async function readTextFile(uri: vscode.Uri, defaultValue?: string) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = Buffer.from(bytes).toString('utf-8');
    logger.trace(`readTextFile ${uri}:`, text);
    return text;
  } catch (error) {
    if (defaultValue !== undefined) {
      logger.info('readTextFile failed:', error);
      return defaultValue;
    }
    throw new Error(
      vscode.l10n.t('An error occurred while read text file "{0}": {1}', [uri.fsPath, getErrorMessage(error)]),
    );
  }
}

/**
 * 写入文件。
 * @param uri 文件uri
 * @param text 文件内容
 * @throws 写入失败时抛出{@link Error}
 */
export async function writeTextFile(uri: vscode.Uri, text: string) {
  logger.trace(`writeTextFile ${uri}:`, text);
  await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(text)));
}

/**
 * 将JSON格式化缩进并写入文件（换行符为CRLF）。
 * @param uri 文件uri
 * @param data JSON数组或对象
 */
export async function writeJsonFile(uri: vscode.Uri, data: object) {
  const text = JSON.stringify(data, null, 4).replace(/\n/g, '\r\n');
  await writeTextFile(uri, text);
}

/**
 * 解析JSON文件。
 * @note 支持包含注释、尾随逗号的JSON
 * @param uri 文件uri
 * @returns JSON数组或对象
 */
export async function parseJsonFile<T = Record<string, unknown>>(uri: vscode.Uri) {
  const text = await readTextFile(uri);
  return parse(text) as T;
}
