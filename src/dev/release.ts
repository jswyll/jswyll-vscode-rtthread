import { readFileSync, writeFileSync } from 'fs';
import { AppVersion } from '../common/version';
import { MyLogger, MyLoggerLevel } from '../common/logger';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { config as dotenvConfig } from 'dotenv';
import { formatTime } from '../common/utils';

const logger = new MyLogger('dev/release', MyLoggerLevel.Info);

if (require.main === module) {
  dotenvConfig({ path: resolve('.env.local') });
  const packageJson = readFileSync('package.json', 'utf-8');
  const v = new AppVersion(JSON.parse(packageJson).version);
  const args = process.argv.slice(2);
  if (args[0] === '--start') {
    const newVersion = `${v.version.major}.${v.version.minor}.${v.version.patch + 1}`;
    execSync(`git flow release start --showcommands v${newVersion}`);
    const changelogContent = readFileSync('CHANGELOG.md', 'utf-8');
    const lines = changelogContent.split(/\r?\n/);
    lines.splice(2, 0, `## ${formatTime('YYYY-MM-DD')} - v${newVersion}\r\n\r\n- \r\n`);
    writeFileSync('CHANGELOG.md', lines.join('\r\n'));
    logger.info('请更新 CHANGELOG.md ，然后运行npm脚本release:finish');
  } else if (args[0] === '--finish') {
    execSync('git add .');
    execSync(`git commit -m "release v${v.toString()}"`);
    execSync(`git flow release finish --showcommands -S v${v.toString()}`);
    execSync('git push --tags github main:main');
    logger.info('release finish.');
  }
}
