import type { Options } from '@wdio/types';
import { resolve } from 'path';
import { WebDriverLogTypes } from '@wdio/types/build/Options';
import { assertParam } from '../common/assert';
import { fileURLToPath } from 'url';
import * as nyc from 'nyc';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

/**
 * 需要用到的环境变量
 */
interface MyEnv extends NodeJS.ProcessEnv {
  /**
   * 可使用GCC构建的RT-Thread项目的根目录，应填写仅用于本扩展测试的
   */
  MY_RTTHREAD_PROJECT_ROOT: string;

  /**
   * 指定测试用例文件的数组，可以使用通配符，应为编译后的js文件（相对于wdio.conf.js的路径），
   * 例如`e2e/extension.test.js`。不填表示所有测试用例。
   */
  MY_WDIO_SPEC?: string;

  /**
   * 测试日志等级
   */
  MY_WDIO_LOG_LEVEL?: WebDriverLogTypes;
}

const dotenvConfigOutput = dotenv.config({ path: resolve('.env.local') });
if (dotenvConfigOutput.error) {
  throw dotenvConfigOutput.error;
}
export const menv = process.env as MyEnv;
assertParam(menv.MY_RTTHREAD_PROJECT_ROOT, '应提供MY_RTTHREAD_PROJECT_ROOT环境变量');
menv.MY_RTTHREAD_PROJECT_ROOT = resolve(menv.MY_RTTHREAD_PROJECT_ROOT);
const extensionPath = resolve('.');
const grep = [];
const isWebTest = Boolean(parseInt(process.env.VSCODE_WEB_TESTS || '', 10));
const storagePath = resolve('.wdio-vscode-service/storage');
const vscodeVersion = '1.99.0';
const capabilities: WebdriverIO.Capabilities = {
  ...(isWebTest
    ? {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless', '--disable-gpu', '--window-size=1440,735'],
        },
      }
    : {
        browserName: 'vscode',
        browserVersion: process.env.VSCODE_VERSION || 'stable',
      }),
  'wdio:vscodeOptions': {
    extensionPath,
    version: vscodeVersion,
    userSettings: {
      'extensions.autoCheckUpdates': false,
    },
    workspacePath: menv.MY_RTTHREAD_PROJECT_ROOT ?? undefined,
    storagePath,
    verboseLogging: false,
    vscodeArgs: {
      disableExtensions: false,
      enableProposedApi: true,
    },
  },
};

if (isWebTest) {
  grep.push('skipWeb');
  if (process.env.CI) {
    grep.push('skipWebCI');
  }
}

export const config: Options.Testrunner = {
  bail: 0,
  baseUrl: 'http://localhost',
  capabilities: [capabilities],
  connectionRetryCount: 1,
  connectionRetryTimeout: 120000,
  exclude: [],
  framework: 'mocha',
  logLevel: menv.MY_WDIO_LOG_LEVEL || 'info',
  maxInstances: 1,
  mochaOpts: {
    ui: 'bdd',
    bail: !!process.env.CI,
    timeout: 600000,
    grep: grep.length > 0 ? grep.join('|') : undefined,
    invert: true,
  },
  reporters: [
    ['spec', { addConsoleLogs: true, showPreface: false }],
    [
      'allure',
      {
        outputDir: '.wdio-vscode-service/allure-results',
        disableWebdriverStepsReporting: true,
        disableWebdriverScreenshotsReporting: true,
      },
    ],
  ],
  services: ['vscode'],
  specFileRetries: process.env.CI ? 1 : 0,
  specs: menv.MY_WDIO_SPEC ? [menv.MY_WDIO_SPEC] : ['./**/*.test.js'],
  waitforTimeout: 600000,

  beforeSession(_config, capabilities: WebdriverIO.Capabilities, specs) {
    const [testFile] = specs;
    const testFilePath = fileURLToPath(new URL(testFile));
    const fileContent = readFileSync(testFilePath, 'utf8');
    const match = fileContent.match(/^const MY_WDIO_WORKSPACE_FOLDER = '([^']+)';/m);
    if (match) {
      capabilities['wdio:vscodeOptions']!.workspacePath = resolve(match[1]);
    } else {
      capabilities['wdio:vscodeOptions']!.workspacePath = menv.MY_RTTHREAD_PROJECT_ROOT;
    }
  },

  afterSession: async function () {
    let nycCwd = extensionPath;
    if (/^[a-zA-Z]:[\\/]/.test(nycCwd)) {
      nycCwd = nycCwd[0].toUpperCase() + nycCwd.slice(1);
    }
    const coverageWriter = new nyc({
      all: true,
      cwd: nycCwd,
      exclude: ['**/test/**'],
      reporter: ['lcov', 'text-summary'],
      reportDir: resolve(nycCwd, 'coverage/test/coverage'),
      tempDirectory: resolve(nycCwd, 'coverage/test/.nyc_output'),
    });
    coverageWriter.writeCoverageFile();
    await coverageWriter.report();
  },
};
