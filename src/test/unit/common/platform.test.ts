import {
  toUnixPath,
  dirnameOrEmpty,
  isAbsolutePath,
  isPathUnderOrEqual,
  removeExeSuffix,
  calculateEnvPathString,
} from '../../../common/platform';

describe('跨平台处理', () => {
  describe('将路径转换为Unix风格', () => {
    it('路径分隔符应全转为左斜杠', async () => {
      expect(toUnixPath('/home/.env\\.venv')).toBe('/home/.env/.venv');
    });

    it('连续的分隔符应合并为一个', async () => {
      expect(toUnixPath('/home/.env\\/\\.venv')).toBe('/home/.env/.venv');
    });

    it('Windows盘符应转为小写', async () => {
      expect(toUnixPath('D:\\RT-ThreadStudio\\workspace')).toBe('d:/RT-ThreadStudio/workspace');
    });

    it('应移除末尾的路径分隔符', async () => {
      expect(toUnixPath('/home/.env/.venv/')).toBe('/home/.env/.venv');
    });
  });

  describe('判断绝对路径', () => {
    it('Windows绝对路径', async () => {
      const p =
        'D:\\RT-ThreadStudio\\repo\\Extract\\ToolChain_Support_Packages\\ARM\\GNU_Tools_for_ARM_Embedded_Processors\\5.4.1\\bin/arm-none-eabi-gcc.exe';
      expect(isAbsolutePath(p)).toBe(true);
    });

    it('Unix绝对路径', async () => {
      expect(isAbsolutePath('/usr/local/bin/openocd')).toBe(true);
    });

    it('相对路径', async () => {
      expect(isAbsolutePath('rt-thread')).toBe(false);
      expect(isAbsolutePath('../..')).toBe(false);
    });
  });

  describe('获取路径的所在目录', () => {
    it('应返回所在目录', async () => {
      expect(dirnameOrEmpty('D:/RT-ThreadStudio\\workspace/')).toBe('d:/RT-ThreadStudio');
      expect(dirnameOrEmpty('/usr/local/bin/make')).toBe('/usr/local/bin');
    });

    it('只有文件名或目录应返回空字符串', async () => {
      expect(dirnameOrEmpty('openocd.exe')).toBe('');
      expect(dirnameOrEmpty('c:/env-windows')).toBe('c:');
    });

    it('空字符串应返回空字符串', async () => {
      expect(dirnameOrEmpty('')).toBe('');
    });
  });

  describe('判断子路径', () => {
    it('子路径应返回true', async () => {
      expect(isPathUnderOrEqual('c:/env-windows', 'c:/env-windows/tools/')).toBe(true);
      expect(isPathUnderOrEqual('c:/env-windows', 'C:\\env-windows\\tools\\python-3.11.9-amd64\\python.exe')).toBe(
        true,
      );
    });

    it('相等应返回true', async () => {
      expect(isPathUnderOrEqual('c:/env-windows', 'c:/env-windows')).toBe(true);
    });

    it('父路径应返回false', async () => {
      expect(isPathUnderOrEqual('D:/RT-ThreadStudio/workspace', 'D:/RT-ThreadStudio')).toBe(false);
    });

    it('不同盘符应返回false', async () => {
      expect(isPathUnderOrEqual('D:/RT-ThreadStudio/workspace', 'E:/RT-ThreadStudio/workspace')).toBe(false);
    });
  });

  describe('移除路径中的`.exe`后缀', () => {
    it('应移除末尾的`.exe`后缀', async () => {
      expect(removeExeSuffix('example.exe')).toBe('example');
    });

    it('应移除末尾的`.EXE`后缀', async () => {
      expect(removeExeSuffix('EXAMPLE.EXE')).toBe('EXAMPLE');
    });

    it('不应移除非末尾的`.exe`后缀', async () => {
      expect(removeExeSuffix('example.exe/file.exe')).toBe('example.exe/file');
    });

    it('不应移除非`.exe`后缀', async () => {
      expect(removeExeSuffix('example.txt')).toBe('example.txt');
    });
  });

  describe('计算环境变量PATH的字符串', () => {
    it('应使用指定的分号或冒号分隔路径', async () => {
      expect(
        calculateEnvPathString(['c:/env-windows/tools/bin', 'c:/env-windows/tools/python-3.11.9-amd64'], ';'),
      ).toBe('c:/env-windows/tools/bin;c:/env-windows/tools/python-3.11.9-amd64');

      expect(calculateEnvPathString(['/Applications/ARM/bin', '/user/bin', '/usr/local/bin'], ':')).toBe(
        '/Applications/ARM/bin:/user/bin:/usr/local/bin',
      );
    });

    it('应去除重复路径', async () => {
      expect(calculateEnvPathString(['/home/user/bin', '/home/user/bin', '/usr/bin'], ':')).toBe(
        '/home/user/bin:/usr/bin',
      );
    });
  });
});
