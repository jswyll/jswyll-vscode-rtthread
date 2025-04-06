import { browser } from '@wdio/globals';
import { StatusBar } from 'wdio-vscode-service';
import { EXTENSION_ID } from '../../common/constants';
import { cleanRtthreadProject, waitExtensionActive } from './common';

const STATUSBAR_REGEX = {
  IMPORT: new RegExp(`^sign-in  Import, ${EXTENSION_ID} - `),
};

describe('状态栏', () => {
  let statusBar: StatusBar;

  before(async () => {
    const workbench = await browser.getWorkbench();
    statusBar = workbench.getStatusBar();
  });

  it('应显示导入按钮', async () => {
    await waitExtensionActive();
  });

  it('未生成配置时应只显示导入按钮', async () => {
    cleanRtthreadProject();
    await waitExtensionActive();
    const items = await statusBar.getItems();
    const extensionStatusbars = items.filter((v) => v.includes(`, ${EXTENSION_ID} - `));
    expect(extensionStatusbars).toHaveLength(1);
    expect(extensionStatusbars[0]).toMatch(STATUSBAR_REGEX.IMPORT);
  });
});
