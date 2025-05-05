import { readFileSync, writeFileSync } from 'fs';
import { MyLogger, MyLoggerLevel } from '../common/logger';

const logger = new MyLogger('dev/ci', MyLoggerLevel.Info);

/**
 * 检查CHANGELOG.md文件中是否有当前版本发布说明，如果有则提取并输出到out/release-notes.md文件中。
 */
export function checkChangelog() {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
  const currentVersion = packageJson.version;
  const changelogContent = readFileSync('CHANGELOG.md', 'utf-8');
  const lines = changelogContent.split(/\r?\n/);
  let releaseMd = '';
  for (const line of lines) {
    if (!releaseMd && line.match(new RegExp(`^## \\d{4}-\\d{2}-\\d{2} - v${currentVersion}$`, 'm'))) {
      releaseMd += line + '\r\n';
    } else if (releaseMd && line.match(/^## /)) {
      break;
    } else if (releaseMd) {
      releaseMd += line + '\r\n';
    }
  }
  if (!releaseMd) {
    logger.error(`未找到版本 ${currentVersion} 的发布说明`);
    process.exit(1);
  }
  writeFileSync('out/release-notes.md', releaseMd.substring(0, releaseMd.length - 2));
}

if (require.main === module) {
  checkChangelog();
}
