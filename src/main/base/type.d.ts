import { GenerateSettings } from '../../common/types/generate';

interface ProblemPattern {
  /**
   * 用于查找任务执行输出中的问题的正则表达式。
   */
  regexp: string;

  /**
   * 该模式是否匹配整个文件中的问题或文件内的位置。
   *
   * 默认为 "location"。
   */
  kind?: 'file' | 'location';

  /**
   * 文件名的匹配组索引。
   */
  file: number;

  /**
   * 问题位置的匹配组索引。有效的定位模式为：(line), (line,column) 和 (startLine,startColumn,endLine,endColumn)。
   * 如果省略，则使用 line 和 column 属性。
   */
  location?: number;

  /**
   * 源文件中问题行的匹配组索引。
   * 如果指定了 location，则可以省略。
   */
  line?: number;

  /**
   * 源文件中问题列的匹配组索引。
   */
  column?: number;

  /**
   * 源文件中问题结束行的匹配组索引。
   *
   * 默认为 undefined。不捕获结束行。
   */
  endLine?: number;

  /**
   * 源文件中问题结束列的匹配组索引。
   *
   * 默认为 undefined。不捕获结束列。
   */
  endColumn?: number;

  /**
   * 问题严重性的匹配组索引。
   *
   * 默认为 undefined。在这种情况下，使用问题匹配器的严重性。
   */
  severity?: number;

  /**
   * 问题代码的匹配组索引。
   *
   * 默认为 undefined。不捕获代码。
   */
  code?: number;

  /**
   * 消息的匹配组索引。默认为 0。
   */
  message: number;

  /**
   * 指定多行问题匹配器中的最后一个模式是否应连续匹配行时循环。
   * 仅在多行问题匹配器中的最后一个问题模式上有效。
   */
  loop?: boolean;
}

/**
 * 描述检测构建输出中问题的问题匹配器（仅列出可能使用到的字段）
 */
interface ProblemMatcher {
  /**
   * 要使用的基问题匹配器的名称。如果指定，基问题匹配器将用作模板，此处指定的属性将替换基问题匹配器的属性。
   */
  base?: string;

  /**
   * 生成的 VS Code 问题的所有者。这通常是 VS Code 语言服务的标识符，如果问题是与语言服务产生的问题合并的。
   * 或者是 'external'。如果省略，默认值为 'external'。
   */
  owner?: string;

  /**
   * 人类可读的字符串，描述此问题的来源。例如 'typescript' 或 'super lint'。
   */
  source?: string;

  /**
   * 由该问题匹配器生成的 VS Code 问题的严重性。
   *
   * 有效值为:
   *   "error": 生成错误。
   *   "warning": 生成警告。
   *   "info": 生成信息。
   *
   * 如果模式没有指定严重性匹配组，则使用该值。
   * 如果省略，则默认为 "error"。
   */
  severity?: string;

  /**
   * 定义问题模式中报告的文件名应如何读取。有效值为：
   *  - "absolute": 文件名始终被视为绝对路径。
   *  - "relative": 文件名始终被视为相对于当前工作目录。这是默认值。
   *  - ["relative", "路径值"]: 文件名始终被视为相对于给定的路径值。
   *  - "autodetect": 文件名被视为相对于当前工作区目录，如果文件不存在，则被视为绝对路径。
   *  - ["autodetect", "路径值"]: 文件名被视为相对于给定的路径值，如果文件不存在，则被视为绝对路径。
   *  - "search": 在目录中执行深度（可能是重的）文件系统搜索。
   *  - ["search", {include: ["${workspaceFolder}"]}]: 在“include”数组中给定的目录中执行深度搜索。
   *  - ["search", {include: ["${workspaceFolder}"], exclude: []}]:
   *    在“include”数组中给定的目录中执行深度搜索，排除“exclude”数组中命名的目录。
   */
  fileLocation?: string | string[] | ['search', { include?: string[]; exclude?: string[] }];

  /**
   * 预定义问题模式的名称、问题模式的内联定义或匹配多行问题的问题模式数组。
   */
  pattern?: string | ProblemPattern | ProblemPattern[];
}

/**
 * tasks.json文件定义（仅列出可能使用到的字段）
 */
export interface TasksJson {
  /**
   * 版本号
   */
  version: string;

  /**
   * 任务列表
   */
  tasks: Array<{
    /**
     * 任务标识符
     */
    label?: string;

    /**
     * 详细描述
     */
    detail?: string;

    /**
     * 依赖的任务列表，是其它任务的`label`。
     */
    dependsOn?: string | string[];

    /**
     * 依赖的任务的执行顺序，`sequence`表示按顺序执行，`parallel`表示同时执行。默认为`parallel`。
     */
    dependsOrder?: 'sequence' | 'parallel';

    /**
     * 任务类型
     */
    type?: string;

    /**
     * 命令
     */
    command?: string;

    /**
     * 命令参数
     */
    args?: string[];

    /**
     * 配置选项，用于指定工作目录和环境变量。
     */
    options?: {
      /**
       * 当前工作目录，可选参数。
       */
      cwd?: string;

      /**
       * 环境变量配置，键值对形式的字符串记录。
       */
      env: Record<string, string>;
    };

    /**
     * Windows特定配置选项。
     */
    windows?: {
      /**
       * 命令
       */
      command?: string;

      /**
       * 命令参数
       */
      args?: string[];

      /**
       * 配置选项，用于指定工作目录和环境变量。
       */
      options?: {
        /**
         * Windows平台下的环境变量配置，键值对形式的字符串记录。
         */
        env: Record<string, string>;
      };
    };

    /**
     * 组配置，定义组的类型及默认状态。
     */
    group?: {
      /**
       * 组的种类标识符。
       */
      kind?: string;

      /**
       * 是否为默认组。
       */
      isDefault?: boolean;
    };

    /**
     * 错误匹配器
     */
    problemMatcher?: string | ProblemMatcher | (string | ProblemMatcher)[];
  }>;
}

/**
 * 扩展设置 - makefile处理
 */
interface MakefileProcessorSettings {
  /**
   * makefile变化时自动重新优化
   */
  'makefileProcessor.watch': boolean;

  /**
   * 在使用RT-Thread Studio构建后提示运行清理任务
   */
  'makefileProcessor.promptCleanWhenBuildByStudio': boolean;
}

/**
 * 扩展设置 - RT-Thread Env
 */
interface RttEnvSettings {
  /**
   * 是否在保存菜单配置成功后自动更新软件包，默认为是。
   */
  'RttEnv.autoUpdatePackages': boolean;
}

/**
 * 扩展设置 - 外观
 */
interface AppearanceSettings {
  /**
   * 是否显示状态栏标题，默认为是
   */
  'appearance.showStatusBarTitle': boolean;
}

/**
 * 生成的参数的扩展设置，每个键都添加了`generate.`前缀
 *
 * TODO: 使用脚本检查package.json中是否已定义配置项
 */
export type ExtensionGenerateSettings = {
  [K in keyof GenerateSettings as `generate.${K}`]: GenerateSettings[K];
};

/**
 * 非本扩展设置
 */
interface AutoDiagnosticInterruptSettings {
  /**
   * vscode - 是否启用自动诊断中断函数
   */
  'autoDiagnosticInterrupt.enable': boolean;

  /**
   * vscode - 自动诊断中断函数的文件路径Glob表达式
   */
  'autoDiagnosticInterrupt.globPattern': string;
}

/**
 * 扩展使用到的的配置
 */
type ExtensionSettings = ExtensionGenerateSettings &
  MakefileProcessorSettings &
  AutoDiagnosticInterruptSettings &
  RttEnvSettings &
  AppearanceSettings;

/**
 * 非本扩展设置的vscode设置
 */
interface VscodeSettings {
  /**
   * vscode - 排除的文件路径
   */
  'files.exclude': Record<string, boolean>;

  /**
   * vscode - 文件名称与语言类型关联
   */
  'files.associations': Record<string, string>;

  /**
   * python插件分析的额外文件夹
   */
  'python.analysis.extraPaths': string[];

  /**
   * 集成终端的环境变量 - windows平台
   */
  'terminal.integrated.env.windows': Record<string, string>;

  /**
   * 集成终端的环境变量 - osx平台
   */
  'terminal.integrated.env.osx': Record<string, string>;

  /**
   * 集成终端的环境变量 - linux平台
   */
  'terminal.integrated.env.linux': Record<string, string>;

  /**
   * 集成终端配置 - windows平台
   */
  'terminal.integrated.profiles.windows': {
    [name: string]: {
      /**
       * 终端命令路径
       */
      path: string;

      /**
       * 终端命令参数
       */
      args?: string[];

      /**
       * 终端命令环境变量
       */
      env?: Record<string, string>;

      /**
       * 是否覆盖名称
       */
      overrideName?: boolean;
    };
  };

  /**
   * 集成终端配置 - macOS平台
   */
  'terminal.integrated.profiles.osx': {
    [name: string]: {
      /**
       * 终端命令路径
       */
      path: string;

      /**
       * 终端命令参数
       */
      args?: string[];

      /**
       * 终端命令环境变量
       */
      env?: Record<string, string>;

      /**
       * 是否覆盖名称
       */
      overrideName?: boolean;
    };
  };

  /**
   * 集成终端配置 - Linux平台
   */
  'terminal.integrated.profiles.linux': {
    [name: string]: {
      /**
       * 终端命令路径
       */
      path: string;

      /**
       * 终端命令参数
       */
      args?: string[];

      /**
       * 终端命令环境变量
       */
      env?: Record<string, string>;

      /**
       * 是否覆盖名称
       */
      overrideName?: boolean;
    };
  };

  /**
   * 集成终端默认配置 - macOS平台
   */
  'terminal.integrated.defaultProfile.osx': string;
}

/**
 * .code-workspace工作区文件
 */
export interface WorkspaceFile {
  /**
   * 工作区文件夹
   */
  folders: unknown[];

  /**
   * 工作区设置
   */
  settings?: VscodeSettings & ExtensionSettings;
}
