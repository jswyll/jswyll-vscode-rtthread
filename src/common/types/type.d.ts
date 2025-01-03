import { TMenuItem } from './menuconfig';

/**
 * 根据RT-Thread Studio项目的`.settings/projcfg.ini`文件中解析的项目配置
 */
interface ProjcfgIni {
  /**
   * 芯片名称，例如`STM32L431CCTx`
   */
  chipName: string | undefined;

  /**
   * 规范化为Unix风格后的RT-Thread Studio原项目根目录
   */
  projectRootDir: string | undefined;

  /**
   * 调试适配器，例如`ST-Link`、`J-Link`、`CMSIS-DAP`
   *
   * @attention 注意去除中划线并转为小写后再作进一步处理
   */
  hardwareAdapter: string | undefined;
}

/**
 * 根据RT-Thread Studio项目的`.cproject`文件解析的构建配置，各项获取不到则为空字符串
 *
 * TODO: 获取不到时的处理
 */
export interface BuildConfig {
  /**
   * 配置名称，例如`Debug`
   */
  name: string;

  /**
   * 工具链前缀，末尾包含`-`，例如`arm-none-eabi-`
   */
  toolchainPrefix: string;

  /**
   * 产物名称，例如`rtthread`
   */
  artifactName: string;

  /**
   * 不包含`-D`的C语言宏定义，例如`STM32F407xx`
   */
  cDefines: string[];

  /**
   * 不包含`-I`的C语言头文件包含文件夹路径（与项目根目录路径的相对路径），例如`rt-thread/include`
   */
  cIncludePaths: string[];

  /**
   * C语言头文件（与项目根目录路径的相对路径），例如`rtconfig_preinc.h`
   */
  cIncludeFiles: string[];

  /**
   * 排除编译的文件或文件夹路径，例如`rt-thread/components/dfs`
   */
  excludingPaths: string[];
}

/**
 * 生成的参数
 */
export interface GenerateSettings {
  /**
   * 项目类型，默认为'RT-Thread Studio'
   */
  projectType: 'RT-Thread Studio' | 'Env';

  /**
   * make的工作基目录，根据{@link InputGenerateParams.projectRootDir}和选择的{@link BuildConfig}计算
   *
   * @attention 应为绝对路径，否则C/C++扩展无法定位出错的文件
   */
  makeBaseDirectory: string;

  /**
   * make工具的文件夹路径
   */
  makeToolPath: string;

  /**
   * env的根目录路径，默认为`c:/env-windows`
   */
  envPath: string;

  /**
   * 构建产物的相对路径或绝对路径，默认为`rt-thread.elf`。
   */
  artifactPath: string;

  /**
   * RT-Thread源码的根目录（RTT_DIR）
   */
  rttDir: string;

  /**
   * GCC工具链的文件夹路径，根据{@link compilerPath}计算，应为绝对路径
   */
  toolchainPath: string;

  /**
   * 当前设置为活跃的{@link BuildConfig 构建配置}的名称
   */
  buildConfigName: string;

  /**
   * RT-Thread Studio安装文件夹路径，仅用于分析可能的{@link makeToolPath}和{@link compilerPath}值
   */
  studioInstallPath: string;

  /**
   * GCC编译器的文件路径，应为绝对路径
   */
  compilerPath: string;

  /**
   * 调试器
   */
  debuggerAdapter: 'STLink' | 'JLink' | 'CMSIS-DAP';

  /**
   * 调试器的接口类型
   */
  debuggerInterface: 'SWD' | 'JTAG';

  /**
   * 用于下载或调试程序的芯片名称，对于STM32应至少为11字符（例如`STM32F407ZG`）
   */
  chipName: string;

  /**
   * 调试器的服务器的文件路径，例如`D:/PyOCD/0.1.3/pyocd.exe`或`openocd`
   */
  debuggerServerPath: string;

  /**
   * {@link debuggerServerPath}的类型为pyocd时，指定的CMSIS-Pack的文件的路径
   */
  cmsisPack: string;

  /**
   * 按快捷键（`Ctrl+Shift+B`）时执行的默认构建任务
   */
  defaultBuildTask: string;

  /**
   * 自定义额外追加到环境变量`PATH`的路径
   */
  customExtraPathVar: string[];

  /**
   * 自定义额外的环境变量键值对
   */
  customExtraVars: Record<string, string | undefined>;
}

/**
 * 配置生成的初始参数，由扩展向webwebview发送
 */
export interface InputGenerateParams {
  /**
   * 生成的参数的设置项
   */
  settings: GenerateSettings;

  /**
   * 根据`.cproject`文件获取到的构建配置，各项获取不到则为空字符串
   */
  cprojectBuildConfigs: BuildConfig[];

  /**
   * 多根工作区时，当前选择的工作区文件夹，`undefined`表示当前不是多根工作区
   */
  workspaceFolderPicked: string | undefined;

  /**
   * 可供选择的编译器文件路径
   */
  compilerPaths: string[];

  /**
   * 可供选择的make工具的文件夹路径
   */
  makeToolPaths: string[];

  /**
   * 可供选择的调试服务器的文件路径
   */
  debuggerServerPaths: string[];

  /**
   * 可供选择的pack的文件路径
   */
  cmsisPackPaths: string[];
}

/**
 * 请求开始生成的参数，由webwebview向扩展发送
 */
export interface DoGenerateParams {
  /**
   * 生成的参数的设置项
   */
  settings: GenerateSettings;

  /**
   * make的主版本号，获取不到则为`undefined`
   */
  makeMajorVersion: number | undefined;

  /**
   * 工具链前缀，末尾包含`-`，例如`arm-none-eabi-`
   */
  toolchainPrefix: string;
}

/**
 * tdesign表单项的校验结果
 */
export interface TdesignCustomValidateResult {
  /**
   * 校验是否通过
   */
  result: boolean;

  /**
   * 校验不通过时，失败的原因
   */
  message: string;

  /**
   * 校验不通过时，提示类型
   */
  type?: 'error' | 'warning';
}

/**
 * 扩展进程向webview的消息表
 */
export interface ExtensionToWebviewDataMap {
  /**
   * 根据扩展设置获取页面的初始数据
   */
  requestInitialValues: {
    /**
     * 参数
     */
    params: InputGenerateParams;
  };

  /**
   * 选择一个文件，未选择则失败
   */
  selectFile: {
    /**
     * 参数
     */
    params: {
      /**
       * 选择的文件的fsPath
       */
      filePath: string;
    };
  };

  /**
   * 选择一个文件夹，未选择则失败
   */
  selectFolder: {
    /**
     * 参数
     */
    params: {
      /**
       * 选择的文件夹的fsPath
       */
      folderPath: string;
    };
  };

  /**
   * 校验指定的路径是否有效
   *
   * - 可以是绝对路径
   *
   * - 可以包含环境变量
   *
   * - 可以是工作区文件夹中的相对路径
   *
   * - 可以省略`.exe`后缀名
   */
  validatePathExists: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;
    };
  };

  /**
   * 检查RT-Thread Studio安装路径是否合理
   */
  validateStudioInstallPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;

      /**
       * 可供选择的编译器文件路径
       */
      compilerPaths: string[];

      /**
       * 可供选择的调试服务器的文件路径
       */
      debuggerServerPaths: string[];

      /**
       * 可供选择的pack的文件路径
       */
      cmsisPackPaths: string[];

      /**
       * 检测到的make工具的文件夹路径
       */
      makeToolPath?: string;
    };
  };

  /**
   * 检查GCC编译器的文件路径
   */
  validateCompilerPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;

      /**
       * 检测到的工具链前缀，例如`arm-none-eabi-`
       */
      toolchainPrefix: string | undefined;
    };
  };

  /**
   * 检查make工具的文件夹路径
   */
  validateMakeToolPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;

      /**
       * make的主版本号，获取不到则为`undefined`
       */
      makeMajorVersion: number | undefined;
    };
  };

  /**
   * 检查Env的文件夹路径
   */
  validateEnvPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;

      /**
       * 可供选择的编译器文件路径
       */
      compilerPaths: string[];
    };
  };

  /**
   * 检查RTT_DIR
   */
  validateRttDir: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;
    };
  };

  /**
   * 检查调试服务器
   */
  validateDebuggerServer: {
    /**
     * 参数
     */
    params: {
      /**
       * 校验结果
       */
      validateResult: TdesignCustomValidateResult;
    };
  };

  /**
   * 开始生成配置
   */
  generateConfig: {
    /**
     * 参数
     */
    params: unknown;
  };
}

/**
 * 扩展进程向webview的消息表
 */
export interface ExtensionToWebviewDataMap {
  /**
   * 获取菜单配置数据
   */
  getMenuconfigData: {
    /**
     * 参数
     */
    params: {
      /**
       * 菜单配置数据
       */
      menus: TMenuItem[];

      /**
       * 是否有修改
       */
      hasChanged: boolean;
    };
  };

  /**
   * 修改菜单配置数据
   */
  changeMenuItem: {
    /**
     * 参数
     */
    params: {
      /**
       * 是否修改成功
       */
      result: boolean;
    };
  };

  /**
   * 设置菜单配置数据
   */
  setMenuconfigData: {
    /**
     * 参数
     */
    params: TMenuItem[];
  };

  /**
   * 保存菜单配置数据
   */
  saveMenuconfig: {
    /**
     * 参数
     */
    params: {
      /**
       * 提示语
       */
      message: string;
    };
  };
}

/**
 * webview向扩展进程的发送消息表
 */
export interface WebviewToExtensionDataMap {
  /**
   * 根据扩展设置获取页面的初始数据
   */
  requestInitialValues: {
    /**
     * 参数
     */
    params: unknown;
  };

  /**
   * 选择一个文件，未选择则失败
   */
  selectFile: {
    /**
     * 参数
     */
    params: unknown;
  };

  /**
   * 选择一个文件夹，未选择则失败
   */
  selectFolder: {
    /**
     * 参数
     */
    params: unknown;
  };

  /**
   * 校验指定的路径是否有效
   *
   * - 可以是绝对路径
   *
   * - 可以包含环境变量
   *
   * - 可以是工作区文件夹中的相对路径
   *
   * - 可以省略`.exe`后缀名
   */
  validatePathExists: {
    /**
     * 参数
     */
    params: {
      /**
       * 要校验的文件或文件夹路径
       */
      path: string;
    };
  };

  /**
   * 检查RT-Thread Studio安装路径是否合理
   */
  validateStudioInstallPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 输入或选择的文件夹路径
       */
      folder: string;
    };
  };

  /**
   * 检查GCC编译器的文件路径
   */
  validateCompilerPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 输入或选择的文件路径
       */
      path: string;
    };
  };

  /**
   * 检查make工具的文件夹路径
   */
  validateMakeToolPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 输入或选择的文件夹路径
       */
      path: string;
    };
  };

  /**
   * 检查Env的文件夹路径
   */
  validateEnvPath: {
    /**
     * 参数
     */
    params: {
      /**
       * 输入或选择的文件夹路径
       */
      path: string;
    };
  };

  /**
   * 检查RTT_DIR
   */
  validateRttDir: {
    /**
     * 参数
     */
    params: {
      /**
       * 输入或选择的文件夹路径
       */
      path: string;
    };
  };

  /**
   * 检查调试服务器
   */
  validateDebuggerServer: {
    /**
     * 参数
     */
    params: {
      /**
       * 选择的调试服务器的路径
       */
      debuggerServerPath: string;
    };
  };

  /**
   * 开始生成配置
   */
  generateConfig: {
    /**
     * 参数
     */
    params: {
      /**
       * 生成参数
       */
      doGenerateParams: DoGenerateParams;
    };
  };
}

/**
 * webview向扩展进程的发送消息表
 */
export interface WebviewToExtensionDataMap {
  /**
   * 获取菜单配置数据
   */
  getMenuconfigData: {
    /**
     * 参数
     */
    params: unknown;
  };

  /**
   * 修改菜单配置数据
   */
  changeMenuItem: {
    /**
     * 参数
     */
    params: {
      /**
       * 菜单节点编号
       */
      id: number;

      /**
       * 值
       */
      value: string | number | boolean;
    };
  };

  /**
   * 保存菜单配置数据
   */
  saveMenuconfig: {
    params: unknown;
  };
}

/**
 * 扩展进程向webview发送的各种消息
 */
export declare type ExtensionToWebviewDatas = {
  [K in keyof ExtensionToWebviewDataMap]: {
    /** 指令 */
    command: K;
  } & ExtensionToWebviewDataMap[K] & {
      /**
       * 错误提示语，`undefined`表示成功，如果出错则为失败原因
       */
      errmsg?: string;
    };
}[keyof ExtensionToWebviewDataMap];

/**
 * （webview向扩展请求时）扩展进程应答的具体消息
 */
export declare type ExtensionToWebviewData<T extends keyof ExtensionToWebviewDataMap> = {
  /** 指令 */
  command: T;
} & ExtensionToWebviewDataMap[T] & {
    /**
     * 错误提示语，`undefined`表示成功，如果出错则为失败原因
     */
    errmsg?: string;
  };

/**
 * webview向扩展进程的发送消息
 */
export declare type WebviewToExtensionData = {
  [K in keyof WebviewToExtensionDataMap]: {
    /** 指令 */
    command: K;
    /** 参数 */
    params: WebviewToExtensionDataMap[K] extends { params: infer P } ? P : never;
  };
}[keyof WebviewToExtensionDataMap];
