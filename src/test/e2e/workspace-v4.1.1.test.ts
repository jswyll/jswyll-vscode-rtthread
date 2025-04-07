import { resolve } from 'path';
import { testExtensionActiveState as waitExtensionReadySate, testInitialStatusbar, TestWorkspaceInfo } from './common';
import { AppVersion } from '../../common/version';

// 扩展wdio，指定当前测试文件的工作区文件夹
const MY_WDIO_WORKSPACE_FOLDER = 'test/projects/stm32f407-atk-explorer-v4.1.1';

/**
 * 测试工作区信息。
 */
const ti: TestWorkspaceInfo = {
  workspaceFolder: resolve(MY_WDIO_WORKSPACE_FOLDER),
  isMultiRootWorkspace: false,
  isRtthreadProject: true,
  rthreadVersion: new AppVersion('4.1.1'),
};

describe('RT-Thread v4.1.1', () => {
  describe('状态栏', () => {
    before(async () => {
      await waitExtensionReadySate(ti);
    });

    testInitialStatusbar(ti);
  });
});
