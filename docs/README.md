# 开发文档

## 目录结构

```sh
jswyll-vscode-rtthread/
├── docs/                      # 开发文档
├── images/                    # 主说明文档的图片
├── l10n/                      # 扩展进程的本地化文件
│   ├── bundle.l10n.json               # 默认翻译
│   └── bundle.l10n.zh-cn.json         # 简体中文翻译
├── out/                           # 构建输出
│   ├── main/                          # 扩展进程
│   │   └── extension.js                   # 扩展进程入口
│   └── webview/                       # webview
│       ├── index.css                      # 样式
│       └── index.js                       # 脚本
├── src/                           # 源码
│   ├── common/                        # 扩展进程与webview的公共代码
│   │   ├── types/                         # 类型声明
│   │   │   ├── generate.d.ts              # 生成配置
│   │   │   ├── menuconfig.d.ts            # 菜单配置
│   │   │   ├── type.d.ts                  # 类型定义
│   │   │   └── vscode.d.ts                # 扩展进程与webview通信
│   │   ├── assert.ts                      # 断言
│   │   ├── constants.ts                   # 常量
│   │   ├── error.ts                       # 错误
│   │   ├── event.ts                       # 事件
│   │   ├── platform.ts                    # 跨平台处理
│   │   ├── utils.ts                       # 工具
│   │   └── version.ts                     # 应用版本处理
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
│   │   │   ├── markdown.ts                    # markdown文档渲染
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
│       │   ├── components/                # 通用
│       │   │   └── logger.ts                  # 日志记录器
│       │   ├── components/                # 组件
│       │   │   ├── InputHex.vue               # 16进制输入框
│       │   │   ├── loading.vue                # 全屏加载
│       │   │   ├── MHome.vue                  # 主页
│       │   │   ├── MMarkdown.vue              # 内联markdown渲染
│       │   │   ├── MSelectInput.vue           # 可输入的下拉选择
│       │   │   ├── TextCllipsis.vue           # 省略文本的悬停显示
│       │   │   └── vscode.ts                  # 与主进程的通信
│       │   ├── locales/                   # 多语言
│       │   │   ├── i18n.ts                    # 全局配置
│       │   │   └── menuconfig.zh-CN.json      # 菜单配置 - 简体中文
│       │   ├── mocks/                     # 模拟数据
│       │   │   ├── menuconfig.ts              # RT-Thread菜单配置
│       │   │   └── preview.ts                 # markdown预览
│       │   ├── stores/                    # 状态管理
│       │   │   └── theme.ts                   # 主题
│       │   ├── views/                     # 页面
│       │   │   ├── GenerateConfig.vue        # 生成配置
│       │   │   ├── MarkdownPreview.vue       # markdown预览
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
└── package.nls.zh-cn.json         # package.json的简体中文翻译
```

## 开发说明

### 开发准备

1. 使用vscode打开主目录，安装并启用`.vscode/extensions.json`的扩展

2. 安装依赖

    ```sh
    npm run install
    ```

### 开发步骤

1. 运行vscode任务`watch:all`

2. 快捷键`F5`启动扩展开发，可以切换开发人员工具（`Ctrl+Shift+I`）或查看输出面板的日志；

3. 修改源码，运行，验证；

4. 打包或发布扩展。

    ```sh
    npm run package
    ```

    ```sh
    npm run publish
    ```

### 测试步骤

首次测试：创建一个仅用于测试的RT-Thread项目，使用RT-Thread Studio构建过一次，删除.gitignore文件中的`Debug`行然后提交到git。

0. 运行vscode任务`watch:all`

1. 在此扩展源码主目录的.env.local文件填写配置，例如：

    ```sh
    # 指定要测试的文件
    MY_WDIO_SPEC="./**/*.test.js"
    # RT-Thread项目的根目录
    MY_RTTHREAD_PROJECT_ROOT=D:/RT-ThreadStudio/workspace/stm32f407-atk-explorer-v4.1.1
    ```

    > **注意**
    >
    > 指定的`MY_RTTHREAD_PROJECT_ROOT`目录会被执行`git reset --hard HEAD && git clean -fdx`，请确保该目录是用来测试的且无需要提交的改动。

2. 执行命令`npm run test-report`（可能配置代理来下载chromedriver）

3. 等待测试完成，在终端中查看测试结果及代码覆盖率。

> **说明**
>
> - 执行命令`npm run report:open`可在浏览器查看测试结果报告（测试需要JAVA8以上环境）。
>
> - 使用浏览器打开`coverage/combined/coverage/lcov-report/index.html`查看代码覆盖率详情。

## 参考文档

- [vscode - Extension API](https://code.visualstudio.com/api)

- [vue3](https://cn.vuejs.org/guide/introduction)

- [TDesign](https://tdesign.tencent.com/vue-next/overview)

## 特别鸣谢

- [kconfiglib](https://github.com/ulfalizer/Kconfiglib)：一个灵活的Python 2/3 Kconfig实现和库。

- [Cortex-Debug](https://marketplace.visualstudio.com/items?itemName=marus25.cortex-debug)：一款适用于ARM Cortex-M架构的GDB调试扩展。

    ```sh
    名称: Cortex-Debug
    ID: marus25.cortex-debug
    说明: ARM Cortex-M GDB Debugger support for VSCode
    发布者: marus25
    VS Marketplace 链接: https://marketplace.visualstudio.com/items?itemName=marus25.cortex-debug
    ```

- [espressif - esp-idf-extension](https://marketplace.visualstudio.com/items?itemName=espressif.esp-idf-extension)：参考了该扩展的部分功能和界面设计。

- [eclipse-cdt - gnu2/GnuMakefileGenerator.java](https://github.com/eclipse-cdt/cdt/blob/main/build/org.eclipse.cdt.managedbuilder.core/src/org/eclipse/cdt/managedbuilder/makegen/gnu2/GnuMakefileGenerator.java)：了解了其makefile生成逻辑。

- [rtthread - tools/eclipse.py](https://github.com/RT-Thread/rt-thread/blob/master/tools/eclipse.py)：参考了其eclipse项目解析逻辑。
