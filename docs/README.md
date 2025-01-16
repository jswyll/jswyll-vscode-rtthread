# 开发文档

## 目录结构

```sh
jswyll-vscode-rtthread/
├── docs/                      # 开发文档
├── images/                    # 主说明文档的图片
├── l10n/                      # 扩展进程的本地化文件
│   ├── bundle.l10n.json               # 默认翻译
│   └── bundle.l10n.zh-CN.json         # 简体中文翻译
├── out/                           # 构建输出
│   ├── main/                          # 扩展进程
│   │   └── extension.js                   # 扩展进程入口
│   └── webview/                       # webview
│       ├── index.css                      # 样式
│       └── index.js                       # 脚本
├── src/                           # 源码
│   ├── common/                        # 扩展进程与webview的公共代码
│   │   ├── types/                         # 类型声明
│   │   │   ├── menuconfig.d.ts            # 菜单配置
│   │   │   └── type.d.ts                  # 扩展进程与webview通信
│   │   ├── assert.ts                      # 断言
│   │   ├── constants.ts                   # 常量
│   │   ├── error.ts                       # 错误
│   │   ├── event.ts                       # 事件
│   │   ├── platform.ts                    # 跨平台处理
│   │   └── utils.ts                       # 工具
│   ├── dev/                           # 开发辅助脚本
│   │   ├── checkTranslation.ts            # 检查翻译是否完整
│   │   ├── esbuild.ts                     # 构建扩展进程
│   │   ├── must-use-await-for-function.js # eslint插件 - 必须await或then函数调用
│   │   └── translate.ts                   # 有道翻译
│   ├── main/                          # 扩展进程的代码
│   │   ├── base/                          # 扩展进程的公共代码
│   │   │   ├── constants.ts                   # 常量
│   │   │   ├── error.ts                       # 错误
│   │   │   ├── fs.ts                          # 文件处理
│   │   │   ├── logger.ts                      # 日志记录器
│   │   │   ├── process.ts                     # 子进程
│   │   │   ├── type.d.ts                      # 仅扩展进程使用的类型声明
│   │   │   ├── webview.ts                     # webview处理
│   │   │   └── workspace.ts                   # 工作区
│   │   ├── kconfig/                       # Kconfig处理
│   │   │   ├── kconfiglib.ts                  # kconfiglib库
│   │   │   └── tree.ts                        # kconfig树结构
│   │   ├── project/                       # 项目处理
│   │   │   ├── cCppProperties.ts              # c_cpp_properties.json处理
│   │   │   ├── cproject.ts                    # .cproject处理
│   │   │   ├── diagnostic.ts                  # 诊断中断函数
│   │   │   ├── generate.ts                    # 生成项目配置文件
│   │   │   ├── makefile.ts                    # makefile处理
│   │   │   └── menuconfig.ts                  # 菜单配置
│   │   ├── task/                          # 任务管理
│   │   │   ├── build.ts                       # 构建任务执行
│   │   │   └── serial.ts                      # 串行任务管理器
│   │   ├── terminal/                      # 终端
│   │   │   └── echo.ts                        # 模拟echo终端
│   │   ├── extension.ts                   # 扩展进程的入口
│   │   └── tsconfig.json                  # typescript配置
│   └── webview/                       # webview vite-vue项目
│       ├── src/                           # 源码
│       │   ├── assets/                        # 静态资源
│       │   │   └── app.css                    # 全局样式
│       │   ├── components/                # 组件
│       │   │   ├── InputHex.vue               # 16进制输入框
│       │   │   ├── MHome.vue                  # 主页
│       │   │   ├── MMarkdown.vue              # 内联markdown渲染
│       │   │   ├── MSelectInput.vue           # 可输入的下拉选择
│       │   │   ├── TextCllipsis.vue           # 省略文本的悬停显示
│       │   │   └── vscode.ts                  # 与主进程的通信
│       │   ├── locales/                   # 多语言
│       │   │   ├── i18n.ts                    # 全局配置
│       │   │   └── menuconfig.zh-CN.json      # 菜单配置 - 简体中文
│       │   ├── stores/                    # 状态管理
│       │   │   └── theme.ts                   # 主题
│       │   ├── views/                     # 页面
│       │   │   ├── GenerateConfig.vue        # 生成配置
│       │   │   └── MenuConfig.vue            # 菜单配置
│       │   ├── App.vue                    # 根组件
│       │   └── main.ts                    # 入口
│       ├── env.d.ts                   # 环境变量类型声明
│       ├── index.html                 # 索引html，仅dev server使用
│       ├── package-lock.json          # 依赖锁定
│       ├── package.json               # webview配置
│       ├── tsconfig.app.json          # typescript配置 - web
│       ├── tsconfig.json              # typescript配置
│       ├── tsconfig.node.json         # typescript配置 - vite.config.mts
│       └── vite.config.mts            # vite配置
├── CHANGELOG.md                   # 更新日志
├── LICENSE                        # 许可证
├── README.md                      # 主说明文档
├── eslint.config.mjs              # eslint配置
├── icon.png                       # 扩展的图标
├── package-lock.json              # 依赖锁定
├── package.json                   # 扩展配置
├── package.nls.json               # package.json的默认翻译
└── package.nls.zh-CN.json         # package.json的简体中文翻译
```

## 开发说明

### 开发准备

1. 使用vscode打开主目录，安装并启用`.vscode/extensions.json`的扩展

2. 安装依赖

    ```sh
    npm run install
    ```

### 开发步骤

1. 快捷键`F5`启动扩展开发，可以切换开发人员工具（`Ctrl+Shift+I`）或查看输出面板的日志；

2. vscode扩展模式开发webview（监听源码变化并构建webview）；

    ```sh
    npm run watch:webview
    ```

3. 修改源码，运行，验证；

4. 打包或发布扩展。

    ```sh
    npm run package
    ```

    ```sh
    npm run publish
    ```

## 参考文档

- [vscode - Extension API](https://code.visualstudio.com/api)

- [vue3](https://cn.vuejs.org/guide/introduction)

- [TDesign](https://tdesign.tencent.com/vue-next/overview)
