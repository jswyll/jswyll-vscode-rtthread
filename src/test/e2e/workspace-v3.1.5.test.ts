import { resolve } from 'path';
import { testExtensionActiveState as waitExtensionReadySate, testInitialStatusbar, TestWorkspaceInfo } from './common';
import { AppVersion } from '../../common/version';

// 扩展wdio，指定当前测试文件的工作区文件夹
const MY_WDIO_WORKSPACE_FOLDER = 'test/projects/stm32f407-atk-explorer-v3.1.5';

/**
 * 测试工作区信息。
 */
const ti: TestWorkspaceInfo = {
  workspaceFolder: resolve(MY_WDIO_WORKSPACE_FOLDER),
  isMultiRootWorkspace: false,
  isRtthreadProject: true,
  rthreadVersion: new AppVersion('3.1.5'),
};

describe('RT-Thread v3.1.5', () => {
  describe('状态栏', () => {
    before(async () => {
      await waitExtensionReadySate(ti);
    });

    testInitialStatusbar(ti);
  });
});
