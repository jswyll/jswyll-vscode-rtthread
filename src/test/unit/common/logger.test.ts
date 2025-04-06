import { EXTENSION_ID } from '../../../common/constants';
import { MyLogger, MyLoggerLevel } from '../../../common/logger';
import { SpyInstance, spyOn } from 'jest-mock';

describe('日志记录器', () => {
  describe('构造函数', () => {
    it('应正确设置标签和日志级别', () => {
      const logger = new MyLogger('testTag', MyLoggerLevel.Debug);
      expect(logger['tag']).toBe(`${EXTENSION_ID} - testTag`);
      expect(logger['level']).toBe(MyLoggerLevel.Debug);
    });
  });

  describe('日志记录方法', () => {
    let logger: MyLogger = new MyLogger('testTag', MyLoggerLevel.All);
    let consoleDebugSpy: SpyInstance;
    let consoleInfoSpy: SpyInstance;
    let consoleWarnSpy: SpyInstance;
    let consoleErrorSpy: SpyInstance;

    beforeEach(() => {
      consoleDebugSpy = spyOn(console, 'debug');
      consoleInfoSpy = spyOn(console, 'info');
      consoleWarnSpy = spyOn(console, 'warn');
      consoleErrorSpy = spyOn(console, 'error');
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('应记录详细日志', () => {
      logger.verbose('Verbose message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{2}:\d{2}:\d{2} \[jswyll-vscode-rtthread - testTag\]$/),
        expect.stringMatching(/^Verbose message$/),
      );
    });

    it('应记录调试日志', () => {
      logger.debug('Debug message');
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{2}:\d{2}:\d{2} \[jswyll-vscode-rtthread - testTag\]$/),
        expect.stringMatching(/^Debug message$/),
      );
    });

    it('应记录信息日志', () => {
      logger.info('Info message');
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{2}:\d{2}:\d{2} \[jswyll-vscode-rtthread - testTag\]$/),
        expect.stringMatching(/^Info message$/),
      );
    });

    it('应记录警告日志', () => {
      logger.warning('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{2}:\d{2}:\d{2} \[jswyll-vscode-rtthread - testTag\]$/),
        expect.stringMatching(/^Warning message$/),
      );
    });

    it('应记录错误日志', () => {
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{2}:\d{2}:\d{2} \[jswyll-vscode-rtthread - testTag\]$/),
        expect.stringMatching(/^Error message$/),
      );
    });

    it('应根据日志级别过滤日志', () => {
      logger = new MyLogger('testTag', MyLoggerLevel.Info);
      logger.debug('Debug message');
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });
  });
});
