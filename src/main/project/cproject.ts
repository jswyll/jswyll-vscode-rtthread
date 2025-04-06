import * as vscode from 'vscode';
import { Logger } from '../base/logger';
import { readTextFile, writeTextFile } from '../base/fs';
import { load } from 'cheerio';
import { toUnixPath } from '../../common/platform';

/**
 * 日志记录器
 */
const logger = new Logger('main/project/cproject');

export class Cproject {
  public static async AddIncludePaths(wsFolder: vscode.Uri, buildConfigName: string, relativeDirs: string[]) {
    let cprojectFileContent = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';
    try {
      cprojectFileContent = await readTextFile(vscode.Uri.joinPath(wsFolder, '.cproject'));
      const $ = load(cprojectFileContent, { xml: true });
      $('storageModule>cconfiguration').each((i, element) => {
        const configuration = $(element).find('storageModule configuration[artifactName]');
        if ($(configuration).attr('name') === buildConfigName) {
          const tools = $(configuration).find('folderInfo toolChain tool');
          const includePathsNode = $(tools).find('option[id*=c.compiler.include.paths]').first();
          const oldIncludePaths = includePathsNode
            .find('listOptionValue')
            .map((_, element) => toUnixPath(element.attribs.value))
            .get();
          for (const dir of relativeDirs) {
            if (!oldIncludePaths.includes(`"\${workspace_loc:/\${ProjName}/${dir}}"`)) {
              const value = `&quot;\${workspace_loc://\${ProjName}/${dir}}&quot;`;
              includePathsNode.append(`<listOptionValue value="${value}" />`);
              logger.info(`added include path: ${dir}`);
            }
          }
        }
      });
      const newCprojectFileContent = $.xml()
        .replaceAll('&#x24;', '$')
        .replaceAll('&apos;', "'")
        .replace(/<(\w+)([^>]*)\/>/g, '<$1$2 />');
      if (cprojectFileContent !== newCprojectFileContent) {
        await writeTextFile(vscode.Uri.joinPath(wsFolder, '.cproject'), newCprojectFileContent);
      }
    } catch (error) {
      logger.error('Failed to read the `.cproject` file in workspace Folder:', error);
    }
  }
}
