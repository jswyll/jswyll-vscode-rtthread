import { resolve } from 'path';
import { testExtensionActiveState as waitExtensionReadySate, testInitialStatusbar, TestWorkspaceInfo } from './common';
import { AppVersion } from '../../common/version';

// 扩展wdio，指定当前测试文件的工作区文件夹
const MY_WDIO_WORKSPACE_FOLDER = '.';

/**
 * 测试工作区信息。
 */
const ti: TestWorkspaceInfo = {
  workspaceFolder: resolve(MY_WDIO_WORKSPACE_FOLDER),
  isMultiRootWorkspace: false,
  isRtthreadProject: false,
  rthreadVersion: new AppVersion(''),
};

describe('非RT-Thread项目', () => {
  describe('状态栏', () => {
    before(async () => {
      await waitExtensionReadySate(ti);
    });

    testInitialStatusbar(ti);
  });
});
