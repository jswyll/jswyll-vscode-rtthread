import { TMenuItem } from './menuconfig';
import { DoGenerateParams, InputGenerateParams } from './generate';

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
 * webview向扩展进程的发送消息表
 */
export interface WebviewToExtensionDataMap {
  /**
   * 获取markdown文本
   */
  updateMarkdownText: {
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
   * 根据扩展设置获取页面的初始数据
   */
  requestInitialValues: {
    /**
     * 参数
     */
    params: Partial<InputGenerateParams>;
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

      /**
       * 可供选择的调试服务器的文件路径
       */
      debuggerServerPaths: string[];
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

      /**
       * menuconfig解析产生的警告
       */
      warnings: string[];
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
 * 扩展进程向webview的消息表
 */
export interface ExtensionToWebviewDataMap {
  /**
   * 获取markdown文本
   */
  updateMarkdownText: {
    /**
     * 参数
     */
    params: {
      /**
       * markdown文本
       */
      markdownText: string;
    };
  };
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
