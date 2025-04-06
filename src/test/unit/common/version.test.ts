import { AppVersion } from '../../../common/version';

describe('版本处理', () => {
  describe('解析字符串版本', () => {
    it('应正确解析带有`v`前缀的版本号字符串', () => {
      const version = AppVersion.ParseVersion('v1.2.3');
      expect(version).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('应正确解析带有`V`前缀的版本号字符串', () => {
      const version = AppVersion.ParseVersion('V1.2.3');
      expect(version).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('应跳过末尾的非数字字符', () => {
      const version = AppVersion.ParseVersion('v7.50.0a');
      expect(version).toEqual({ major: 7, minor: 50, patch: 0 });
    });

    it('应正确解析两位数字版本号字符串', () => {
      const version = AppVersion.ParseVersion('v7.50a');
      expect(version).toEqual({ major: 7, minor: 50, patch: 0 });
    });

    it('非字符串应为无效', () => {
      const version = AppVersion.ParseVersion(123 as unknown as string);
      expect(version).toEqual({ major: NaN, minor: NaN, patch: NaN });
    });
  });

  describe('构造版本', () => {
    it('应正确解析有效的版本号字符串', () => {
      const version = new AppVersion('1.2.3');
      expect(version.version).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('应返回无效版本号对象对于无效的版本号字符串', () => {
      const version = new AppVersion('invalid');
      expect(version.version).toEqual({ major: NaN, minor: NaN, patch: NaN });
    });

    it('应正确解析对象', () => {
      const version = new AppVersion({ major: 1, minor: 2, patch: 3 });
      expect(version.version).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('应正确解析数字', () => {
      const version = new AppVersion(1, 2, 3);
      expect(version.version).toEqual({ major: 1, minor: 2, patch: 3 });
    });
  });

  describe('比较版本号', () => {
    it('应正确判断版本号是否相等', () => {
      const versionA = new AppVersion(1, 2, 3);
      const versionB = new AppVersion(1, 2, 3);
      expect(versionA.eq(versionB)).toBe(true);
      expect(versionB.eq(versionA)).toBe(true);
    });

    it('应正确判断版本号是否大于另一个版本号', () => {
      let versionA;
      let versionB;

      versionA = new AppVersion(2, 2, 5);
      versionB = new AppVersion(1, 2, 3);
      expect(versionA.gt(versionB)).toBe(true);
      expect(versionB.gt(versionA)).toBe(false);

      versionA = new AppVersion(1, 3, 2);
      versionB = new AppVersion(1, 2, 3);
      expect(versionA.gt(versionB)).toBe(true);
      expect(versionB.gt(versionA)).toBe(false);

      versionA = new AppVersion(1, 2, 4);
      versionB = new AppVersion(1, 2, 3);
      expect(versionA.gt(versionB)).toBe(true);
      expect(versionB.gt(versionA)).toBe(false);

      versionA = new AppVersion('');
      versionB = new AppVersion(1, 2, 3);
      expect(versionA.gt(versionB)).toBe(false);
      expect(versionB.gt(versionA)).toBe(false);
    });

    it('应正确判断版本号是否小于另一个版本号', () => {
      const versionA = new AppVersion(1, 2, 3);
      const versionB = new AppVersion(1, 2, 4);
      expect(versionA.lt(versionB)).toBe(true);
      expect(versionB.lt(versionA)).toBe(false);
    });

    it('应正确判断版本号是否大于等于另一个版本号', () => {
      const versionA = new AppVersion(1, 2, 3);
      const versionB = new AppVersion(1, 2, 3);
      expect(versionA.gte(versionB)).toBe(true);
      expect(versionB.gte(versionA)).toBe(true);
    });

    it('应正确判断版本号是否小于等于另一个版本号', () => {
      const versionA = new AppVersion(1, 2, 3);
      const versionB = new AppVersion(1, 2, 3);
      expect(versionA.lte(versionB)).toBe(true);
      expect(versionB.lte(versionA)).toBe(true);
    });
  });

  describe('判断版本升级', () => {
    it('应正确判断主版本号是否升级', () => {
      const versionA = new AppVersion(2, 0, 0);
      const versionB = new AppVersion(1, 9, 9);
      const versionC = new AppVersion('');
      expect(versionA.isUpgradeMajor(versionB)).toBe(true);
      expect(versionB.isUpgradeMajor(versionA)).toBe(false);
      expect(versionA.isUpgradeMajor(versionC)).toBe(false);
      expect(versionB.isUpgradeMajor(versionC)).toBe(false);
    });

    it('应正确判断次版本号是否升级', () => {
      const versionA = new AppVersion(1, 3, 0);
      const versionB = new AppVersion(1, 2, 9);
      const versionC = new AppVersion('');
      expect(versionA.isUpgradeMinor(versionB)).toBe(true);
      expect(versionB.isUpgradeMinor(versionA)).toBe(false);
      expect(versionA.isUpgradeMajor(versionC)).toBe(false);
      expect(versionB.isUpgradeMajor(versionC)).toBe(false);
    });

    it('应正确判断修订版本号是否升级', () => {
      const versionA = new AppVersion(1, 2, 4);
      const versionB = new AppVersion(1, 2, 3);
      expect(versionA.isPatchGreaterThan(versionB)).toBe(true);
      expect(versionB.isPatchGreaterThan(versionA)).toBe(false);
    });
  });

  describe('转换为字符串', () => {
    it('应正确转换为字符串', () => {
      const version = new AppVersion(1, 2, 3);
      expect(version.toString()).toBe('1.2.3');
    });
  });
});
