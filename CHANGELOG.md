# RT-Thread项目助手 - 更新日志

## 2025-03-20 - v0.3.11

优化 仅构建方式为RT-Thread Studio Makefile时弹出原项目文件夹输入确认。

## 2025-03-19 - v0.3.10

- 新增 设置项`jswyll-vscode-rtthread.generate.svdFile`指定svd的文件路径（用于查看外设寄存器）。

## 2025-03-18 - v0.3.9

- 优化 加载菜单配置时显示kconfiglib解析警告。

- 优化 切换工作区文件夹后关闭已打开的菜单配置面板。

- 优化 项目被移动后猜测原项目文件夹并让用户输入确认。

- 调整 不自动结束打开的ConEmu（请自行关闭）。

## 2025-03-16 - v0.3.8

修复 切换工作区文件夹后分析的rt-thread/src/subdir.mk不对应的问题

## 2025-03-16 - v0.3.7

优化 避免分析rt-thread/src/subdir.mk发生竞态

## 2025-03-16 - v0.3.6

- 优化 切换工作区文件夹后状态栏按钮的显示条件。

- 优化 从`rtconfig_preinc.h`提取宏定义到`.vscode/c_cpp_properties.json`。

- 调整 打开移动的RT-Thread Studio项目时，根据`rt-thread/src/subdir.mk`文件推测原项目的根路径。

- 调整 默认不启用诊断RT-Thread中断函数。

- 修复 初始打开多根工作区状态栏不显示选择工作区文件夹按钮的问题。

## 2025-03-15 - v0.3.5

- 修复 RT-Thread Stuio Makefile构建方式清除任务不正确的问题。

## 2025-03-15 - v0.3.4

- 优化 windows平台Env 2.x未初始化虚拟环境时弹窗提示。

## 2025-03-15 - v0.3.3

- 优化 检测MacOS的GCC编译器路径以供选择。

- 优化 右键打开ConEmu未检测到时报错。

- 修复 打开菜单配置面板后环境变量有丢失的问题。

## 2025-03-14 - v0.3.2

- 修复 type.d.ts文件的重复声明。

## 2025-03-14 - v0.3.1

- 优化 从环境变量中获取可用的调试服务器以供选择。

- 修复 Ubuntu平台下不能正确显示中文的问题。

## 2025-03-13 - v0.3.0

- 新增 对接Ubuntu与MacOS平台的Env。

- 新增 生成RT-Thread Env配置时，如果没有`.vscode/c_cpp_properties.json`文件则自动调用`scons --target=vsc`生成。

- 优化 保存问题匹配器到设置文件，允许配置完成后脱离（禁用）此扩展。

- 优化 降低Env Windows中git.exe的优先级。

- 优化 细化右键菜单显示条件。

- 优化 切换工作区文件夹时自动关闭已打开的终端。

- 优化 当扩展的主要版本或特性版本更新时，弹出更新日志。

- 调整 生成配置时，默认的Env根路径（从`c:/env-windows`）改为`${userHome}/.env`。

- 修复 设置项“项目类型”的作用域应为工作区文件夹。

- 修复 从状态栏按钮打开终端时，工作路径应为选择的工作区文件夹。

- 移除 选择调试服务器为Segger Jlink时生成hex文件 **（破坏性变更，请安装Segger Jlink至V7.90以上以支持加载`.elf`文件）**。

## 2025-01-16 - v0.2.0

- 新增 支持Env Windows（v1.x和v2.x）：

  - 支持菜单配置面板；
从此村村村村村村村村
  - 支持scons方式编译；

  - 支持在终端执行scons、pkgs、menuconfig命令；

  - 支持在资源管理器上右键，选择“在此处打开ConEmu”。

- 新增 路径规则支持用`${userHome}`表示当前用户的主目录。

- 新增 搜索RT-Thread Studio安装目录下的调试器路径时，添加搜索openocd。

- 新增 RT-Thread Studio类型的项目支持在资源管理器右键菜单 - 添加到头文件搜索路径。

- 新增 扩展设置项：

  - Env方式支持自定义下载和调试时所用的产物路径。

  - 使用Env方式时，保存配置时是否自动更新软件包。

  - 自定义任务和终端中额外的环境变量（如果相同则覆盖）。

  - 状态栏图标是否显示标题。

      > **说明**
      >
      > 如果状态栏的按钮过多，可关闭此设置。或者，右键隐藏不常用的按钮。

- 新增 将状态栏的所有按钮的命令导出，支持通过命令面板（`Ctrl+Shift+P`）运行

- 优化 扩展设置项除了“RT-Thread Studio”安装路径以外，都允许在账户云同步。

- 优化 如果在vscode设置修改了扩展设置，提示是否重新加载vscode窗口或重新生成配置。

- 移除 引用用户主目录使用`~`的方式（请改成`${userHome}`）、引用环境变量使用`${VAR_NAME}`的方式（请写成`${env:VAR_NAME}`） **（破坏性变更）** 。

## 2025-01-02 - v0.1.1

- 新增 解析项目信息，生成vscode的配置文件：

  - 可视化：通过配置向导面板进行输入或选择参数。从环境变量`PATH`中寻找可用的GCC编译器；Windows环境下选择RT-Thread Studio路径后，自动寻找GCC编译器路径、Make工具路径、调试器服务器等以供选择

  - 代码浏览：生成C/C++浏览配置（`.vscode/c_cpp_properties.json`）的宏定义、头文件（搜索）路径；根据排除路径生成vscode资源管理器排除规则（`files.exclude`）。

  - 程序编译：

    - 多进程编译加快速度；如果make的主版本号大于4，添加`--output-sync=target`避免不同文件的编译报错混淆。

    - 屏蔽编译和链接的一长串参数输出，并添加形如Keil IDE的编译与链接提示：

      ```sh
      compiling ../rt-thread/src/clock.c...
      compiling ../rt-thread/src/components.c...
      compiling ../rt-thread/src/device.c...
      compiling ../applications/main.c...
      linking ...
      arm-none-eabi-objcopy -O binary "rtthread.elf"  "rtthread.bin"
      arm-none-eabi-size --format=berkeley "rtthread.elf"
      text    data     bss     dec     hex filename
      55400    1468    3368   60236    eb4c rtthread.elf
      ```

    - 提供更准确的问题匹配器，避免在问题面板打开出错文件跳转失败

  - 下载程序：调试服务器类型支持Segger JLink、PyOCD、OpenOCD（前两个Windows环境下RT-Thread Studio已经内置），调试器类型支持常用的JLink、ST-Link、CMSIS-DAP。

  - 调试程序：调试所支持的调试器类型和下载程序的一样；生成[Cortex-Debug](https://marketplace.visualstudio.com/items?itemName=marus25.cortex-debug)扩展的调试启动配置。

- 新增 跨平台：已在Windows、MacOS（10.13和15.2）、Linux（Ubuntu 24.04）上测试通过。

- 新增 检查中断函数：检查形如`void xxx_IRQHandler(void)`的函数是否调用了`rt_interrupt_enter()`和`rt_interrupt_leave()`。
