/**
 * 应用版本
 */
export interface IAppVersion {
  /**
   * 主版本号
   */
  major: number;

  /**
   * 次版本号
   */
  minor: number;

  /**
   * 修订版本号
   */
  patch: number;
}

/**
 * 应用版本。
 */
export class AppVersion {
  /**
   * 版本号对象
   */
  public version: IAppVersion;

  /**
   * 构造一个AppVersion对象。
   * @param version 版本号字符串，例如`1.2.3`。
   */
  constructor(version: string);
  /**
   * 构造一个AppVersion对象。
   * @param version 版本对象
   */
  constructor(version: IAppVersion);
  /**
   * 构造AppVersion对象。
   * @param major 主版本号
   * @param minor 次版本号
   * @param patch 修订版本号
   */
  constructor(
    /**
     * 主版本号
     */
    major: number,

    /**
     * 次版本号
     */
    minor: number,

    /**
     * 修订版本号
     */
    patch: number,
  );
  constructor(arg1: string | IAppVersion | number, minor?: number, patch?: number) {
    if (typeof arg1 === 'string') {
      this.version = this.ParseVersion(arg1);
    } else if (typeof arg1 === 'object') {
      this.version = arg1;
    } else {
      this.version = { major: arg1, minor: minor!, patch: patch! };
    }
  }

  /**
   * 解析形如`x.y.z`的3位数字版本号字符串，可包含`v`或`V`前缀，可包含非数字后缀。
   * @param version 版本号字符串，例如`1.2.3`。
   * @returns 包含主版本号、次版本号和补丁版本号的对象，如果解析失败则返回`{major: -1, minor: -1, patch: -1}`。
   */
  ParseVersion(version: string): IAppVersion {
    const invalidVersion = { major: -1, minor: -1, patch: -1 };
    if (typeof version !== 'string') {
      return invalidVersion;
    }

    const versionRegex = /[vV]?^(\d+)\.(\d+)\.(\d+)/;
    const match = version.match(versionRegex);
    if (!match) {
      return invalidVersion;
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = parseInt(match[3], 10);
    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
      return invalidVersion;
    }

    return { major, minor, patch };
  }

  /**
   * 比较两个版本号。
   * @param versionA 版本号A
   * @param versionB 版本号B
   * @returns 如果版本号A大于版本号B，则返回1；如果版本号A小于版本号B，则返回-1；如果版本号相等，则返回0。
   */
  Compare(versionA: IAppVersion, versionB: IAppVersion): number {
    if (versionA.major > versionB.major) {
      return 1;
    } else if (versionA.major < versionB.major) {
      return -1;
    }

    if (versionA.minor > versionB.minor) {
      return 1;
    } else if (versionA.minor < versionB.minor) {
      return -1;
    }

    if (versionA.patch > versionB.patch) {
      return 1;
    } else if (versionA.patch < versionB.patch) {
      return -1;
    }

    return 0;
  }

  /**
   * 判断版本号是否相等
   * @param v 要比较的版本
   * @returns 是否相等
   */
  isEqualsTo(v: AppVersion) {
    return this.Compare(this.version, v.version) === 0;
  }

  /**
   * 判断版本号是否大于另一个版本号
   * @param v 要比较的版本
   * @returns 是否大于
   */
  isGreaterThan(v: AppVersion) {
    return this.Compare(this.version, v.version) > 0;
  }

  /**
   * 判断版本号是否小于另一个版本号
   * @param v 要比较的版本
   * @returns 是否小于
   */
  isLessThan(v: AppVersion) {
    return this.Compare(this.version, v.version) < 0;
  }

  /**
   * 判断版本号是否小于等于另一个版本号
   * @param v 要比较的版本
   * @returns 是否小于等于
   */
  isLessOrEqualsTo(v: AppVersion) {
    return this.Compare(this.version, v.version) <= 0;
  }

  /**
   * 判断主版本号是否大于另一个版本号
   * @param v 要比较的版本
   */
  isUpgradeMajor(v: AppVersion) {
    return this.version.major > v.version.major;
  }

  /**
   * 判断次版本号是否大于另一个版本号
   * @param v 要比较的版本
   */
  isUpgradeMinor(v: AppVersion) {
    return this.version.minor > v.version.minor;
  }

  /**
   * 判断修订版本号是否大于另一个版本号
   */
  isPatchGreaterThan(v: AppVersion) {
    return this.version.patch > v.version.patch;
  }

  /**
   * 转为字符串
   * @returns 版本号字符串
   */
  toString() {
    return `${this.version.major}.${this.version.minor}.${this.version.patch}`;
  }
}
