<script lang="ts" setup>
import {
  Button as TButton,
  Col as TCol,
  DialogPlugin,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  RadioGroup as TRadioGroup,
  RadioButton as TRadioButton,
  Row as TRow,
  Select as TSelect,
  type FormInstanceFunctions,
  type FormRules,
} from 'tdesign-vue-next';
import FolderOpenIcon from 'tdesign-icons-vue-next/esm/components/folder-open';
import HelpCircleIcon from 'tdesign-icons-vue-next/esm/components/help-circle';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import MMarkdown from '@webview/components/MMarkdown.vue';
import { useWebview } from '@webview/components/vscode';
import type { ExtensionToWebviewDatas } from '../../../common/types/type';
import { EXTENSION_ID } from '../../../common/constants';
import { assertParam } from '../../../common/assert';
import { toUnixPath } from '../../../common/platform';
import { addToSet } from '../../../common/utils';
import MSelectInput from '@webview/components/MSelectInput.vue';
import type { InputGenerateParams, DoGenerateParams, GenerateSettings } from '../../../common/types/generate';
import type { TdesignCustomValidateResult } from '../../../common/types/vscode';
import { useFullscreenLoading } from '@webview/components/loading';
import { getDebugServerType } from '../../../common/debugger';
import chipNames from '@webview/assets/chips.json';

/**
 * 翻译
 */
const { t } = useI18n({
  /**
   * 消息源
   */
  messages: {
    /**
     * 英语
     */
    en: {},

    /**
     * 中文
     */
    zh: {
      'Current workspace folder': '当前工作区文件夹',
      'Input or select a folder': '请输入或选择文件夹',
      'RT-Thread Studio Path': 'RT-Thread Studio路径',
      'RT-Thread Studio installation folder for finding the following tools.':
        'RT-Thread Studio的安装文件夹，用于寻找以下的工具。',
      'GCC Compiler Path': 'GCC编译器路径',
      'The file path to the GCC compiler (for example, `arm-none-eabi-gcc.exe`).':
        'GCC编译器（例如`arm-none-eabi-gcc.exe`）文件的路径。',
      'Please enter or manually select GCC compiler path (eg. arm-none-ebi-gcc)':
        '请输入或手动选择GCC编译器的路径（例如：arm-none-ebi-gcc）',
      'Make Tool Path': 'Make工具路径',
      'The **folder** of make tool. If your make tool PATH has been added to the `PATH` environment variable, you can leave it out.':
        'make的**所在文件夹**。如果你的make工具路径已经添加到环境变量`PATH`则可不填此项。',
      'Debugger type': '调试器类型',
      'The type of debugger to download or debug.': '用于下载或调试的调试器类型。',
      'pyocd can be automatically detected, optional.': 'pyocd可以自动检测，无需选择。',
      'Debugger interface': '调试器接口',
      'Debugger interface type.': '调试器接口类型。',
      'Build Config': '构建配置',
      'Currently active build configuration. Different configurations are available for different environments or targets, such as `Debug` and `Release` .':
        '当前设置为活跃的构建配置。不同的配置可用于不同的环境或目标，例如`Debug`、`Release`。',
      'Chip Name': '芯片名称',
      'Chip name to download or debug the program (e.g. `STM32F407ZG` )':
        '下载或调试程序的芯片名称（例如`STM32F407ZG`）。',
      '"{0}" is required': '"{0}"需要填写',
      'The toolchain prefix("{0}") of the selected compiler is different from that of .cproject configuration("{1}"). Please select the correct compiler.':
        '所选编译器的工具链前缀 "{0}" 与.cproject配置的工具链前缀 "{1}" 不同。请选择正确的编译器。',
      'Not Found {0} in {1}': '在{1}中未找到{0}',
      '{0} should be one of the option values, please select it again.': '{0}应为选项值之一，请重新选择。',
      'A more specific chip name should be provided to correctly identify the FLASH size, such as `STM32F407ZG`.':
        '应提供更具体的芯片名称使调试器正确识别FLASH大小，例如`STM32F407ZG`',
      'Default Build Task': '默认构建任务',
      'The default build task to execute when you press the key shortcut (`Ctrl+Shift+B`).':
        '按快捷键（`Ctrl+Shift+B`）时执行的默认构建任务。',
      Build: '构建',
      'Build and Download': '构建并下载',
      'The project root directory specified when the system is not windows.': '当系统不为windows时，指定的项目根目录。',
      Rebuild: '重新构建',
      Generate: '生成',
      Docs: '帮助文档',
      Ignore: '忽略',
      Reselect: '重新选择',
      'Debugger Server': '调试服务器',
      'The path to the server used for downloading or debugging. Support `openocd`, `pyocd`, `JLink` and `ST-LINK_gdbserver`.':
        '用于下载或调试的服务器的路径。支持`openocd`、`pyocd`、`JLink`和`ST-LINK_gdbserver`。',
      'External algorithm': '外部算法',
      'STLink external algorithm file path. If you leave it blank, it indicates that it is not used. This can be an absolute path or a relative path to the project root.':
        'STLink外部算法文件的路径，留空则表示不使用。可以是绝对路径或与项目根目录的相对路径。',
      'Cmsis Pack': 'Cmsis包',
      'File path of the Cmsis package corresponding to the chip. **If the name of the chip is not [pyOCD Built-in targets] (https://pyocd.io/docs/builtin-targets.html) should be specified.** Built-in packages can be added via the `pyocd pack` related commands.':
        '芯片对应的Cmsis包的文件路径。**如果芯片名称不是[pyocd内置目标](https://pyocd.io/docs/builtin-targets.html)则应指定。** 可以通过`pyocd pack`相关命令添加内置包。',
      'Parsing project information...': '解析项目信息...',
      'Validating the form parameter...': '校验表单参数...',
      'Generating...': '生成...',
      'The form fails the validation': '表单校验不通过',
      'Not set': '不设置',
      'Project Type': '项目类型',
      'The way to build project.': '构建项目的方式。',
      'Env Tool Path': 'Env工具路径',
      'The root directory of the Env tool, the first level of which should contain the `tools` folder.':
        'Env工具的根目录，其第一级应包含`tools`文件夹。',
      'RTT Root Path': 'RTT根目录',
      'The root directory of the RT-Thread source code (RTT_DIR).': 'RT-Thread源码的根目录（RTT_DIR）。',
    },
  },
});

const { requestExtension } = useWebview();

const { startLoading, stopLoading, isLoading } = useFullscreenLoading();

/**
 * 表单引用
 */
const form = ref<FormInstanceFunctions>();

/**
 * 表单数据
 */
const data = ref<InputGenerateParams & DoGenerateParams>({
  settings: {
    projectType: 'RT-Thread Studio',
    makeBaseDirectory: '',
    toolchainPath: '',
    makeToolPath: '',
    envPath: '',
    artifactPath: 'rt-thread.elf',
    rttDir: 'rt-thread',
    buildConfigName: '',
    studioInstallPath: '',
    compilerPath: '',
    debuggerAdapter: 'STLink',
    debuggerInterface: 'SWD',
    stlinkExtload: '',
    chipName: '',
    debuggerServerPath: '',
    cmsisPack: '',
    defaultBuildTask: `${EXTENSION_ID}: build`,
    customExtraPathVar: [],
    customExtraVars: {},
  },
  compilerPaths: [],
  makeToolPaths: [],
  debuggerServerPaths: [],
  stlinkExtloadPaths: [],
  cmsisPackPaths: [],
  cprojectBuildConfigs: [],
  workspaceFolderPicked: undefined,
  makeMajorVersion: undefined,
  toolchainPrefix: 'arm-none-eabi-',
  envPaths: [],
});

/**
 * 表单校验规则
 */
const formRules = computed<FormRules>(() => {
  return {
    projectType: [
      {
        required: data.value.settings.projectType === 'RT-Thread Studio',
        message: t('"{0}" is required', [t('Project Type')]),
        type: 'error',
      },
    ],
    envPath: [
      {
        required: data.value.settings.projectType === 'Env',
        message: t('"{0}" is required', [t('Env Tool Path')]),
        type: 'error',
      },
      {
        validator: validateEnvPath,
      },
    ],
    buildConfigName: [
      {
        required: data.value.settings.projectType === 'RT-Thread Studio',
        message: t('"{0}" is required', [t('Build Config')]),
        type: 'error',
      },
      {
        validator: () => {
          if (data.value.settings.projectType === 'RT-Thread Studio') {
            getSelectedBuildConfigAndCheck();
          }
          return true;
        },
      },
    ],
    studioInstallPath: [{ validator: validateStudioInstallPath }],
    compilerPath: [
      {
        validator: validateCompilerPath,
      },
    ],
    makeToolPath: [
      {
        validator: async (value: string) => {
          const { validateResult, makeMajorVersion: makeMajorVer } = await requestExtension({
            command: 'validateMakeToolPath',
            params: {
              path: value,
            },
          });
          if (validateResult.result) {
            data.value.makeMajorVersion = makeMajorVer;
          }
          return validateResult;
        },
      },
    ],
    debuggerAdapter: [
      {
        validator: (value: string) => {
          return validateSelectValue(value, debuggerAdapterOptions, t('Debugger type'));
        },
      },
    ],
    debuggerInterface: [
      {
        validator: (value: string) => {
          return validateSelectValue(value, debuggerInterfaceOptions, t('Debugger interface'));
        },
      },
    ],
    chipName: [
      {
        validator: (value: string) => {
          if (!value || (value.startsWith('STM32') && value.length < 11)) {
            return {
              result: false,
              message: t(
                'A more specific chip name should be provided to correctly identify the FLASH size, such as `STM32F407ZG`.',
              ),
              type: 'warning',
            };
          }

          return true;
        },
      },
    ],
    debuggerServerPath: [
      {
        validator: async (value: string) => {
          const { validateResult } = await requestExtension({
            command: 'validateDebuggerServer',
            params: {
              debuggerServerPath: value,
            },
          });
          return validateResult;
        },
      },
    ],
    cmsisPack: [
      {
        validator: async (value: string) => {
          if (debuggerServerType.value !== 'pyocd' || !value) {
            return true;
          }

          const { validateResult } = await requestExtension({
            command: 'validatePathExists',
            params: {
              path: value,
            },
          });
          return validateResult;
        },
      },
    ],
  };
});

/**
 * 系统架构平台
 */
const platform = document.documentElement.getAttribute('data-platform');

/**
 * 编译器是否显示选择弹窗
 */
const compilerPathPopupVisible = ref(false);

/**
 * 调试器选项
 */
const debuggerAdapterOptions = [
  {
    label: 'ST-Link (V1/V2/V2-1/V3)',
    value: 'STLink',
  },
  {
    label: 'JLink',
    value: 'JLink',
  },
  {
    label: 'CMSIS-DAP',
    value: 'CMSIS-DAP',
  },
];

/**
 * 调试器接口选项
 */
const debuggerInterfaceOptions = [
  {
    label: 'SWD',
    value: 'SWD',
  },
  {
    label: 'JTAG',
    value: 'JTAG',
  },
];

/**
 * 调试服务器的类型
 */
const debuggerServerType = computed(() => {
  return getDebugServerType(data.value.settings.debuggerServerPath);
});

/**
 * 获取选中的构建配置
 */
function getSelectedBuildConfigAndCheck() {
  const { buildConfigName } = data.value.settings;
  const buildConfig = data.value.cprojectBuildConfigs.find((v) => v.name === buildConfigName);
  assertParam(buildConfig, t('Not Found {0} in {1}', [t('Build Config') + buildConfigName, '.croject']));
  return buildConfig;
}

/**
 * 校验Env路径
 * @param value Env路径
 * @returns 校验结果
 */
async function validateEnvPath(value: string) {
  const { validateResult, compilerPaths, debuggerServerPaths } = await requestExtension({
    command: 'validateEnvPath',
    params: {
      path: value,
    },
  });

  if (validateResult.result) {
    data.value.compilerPaths = [...new Set([...compilerPaths, ...data.value.compilerPaths])];
    data.value.debuggerServerPaths = [...new Set([...debuggerServerPaths, ...data.value.debuggerServerPaths])];
  }
  return validateResult;
}

/**
 * 校验编译器路径
 * @param value 编译器路径
 * @returns 校验结果
 */
async function validateCompilerPath(value: string) {
  if (!value) {
    const validateResult: TdesignCustomValidateResult = {
      result: false,
      type: 'error',
      message: t('"{0}" is required', [t('GCC Compiler Path')]),
    };
    return validateResult;
  }

  const { validateResult, toolchainPrefix } = await requestExtension({
    command: 'validateCompilerPath',
    params: {
      path: value,
    },
  });

  if (data.value.settings.projectType === 'RT-Thread Studio') {
    const buildConfig = getSelectedBuildConfigAndCheck();
    const prefix = buildConfig.toolchainPrefix;
    if (toolchainPrefix && prefix && toolchainPrefix !== prefix) {
      validateResult.result = false;
      validateResult.type = 'error';
      validateResult.message = t(
        'The toolchain prefix("{0}") of the selected compiler is different from that of .cproject configuration("{1}"). Please select the correct compiler.',
        [toolchainPrefix, prefix],
      );
      return validateResult;
    }
  }

  if (validateResult.result === false) {
    compilerPathPopupVisible.value = false;
    return validateResult;
  }

  data.value.toolchainPrefix = toolchainPrefix!;
  return true;
}

/**
 * 校验RT-Thread Studio安装路径
 * @param value 路径值
 * @returns 校验结果
 */
async function validateStudioInstallPath(value: string) {
  if (!value) {
    return true;
  }
  const result = await requestExtension({
    command: 'validateStudioInstallPath',
    params: {
      folder: value,
    },
  });
  if (result.validateResult.result) {
    addToSet(data.value.compilerPaths, result.compilerPaths);
    addToSet(data.value.debuggerServerPaths, result.debuggerServerPaths);
    addToSet(data.value.makeToolPaths, [result.makeToolPath]);
    addToSet(data.value.cmsisPackPaths, result.cmsisPackPaths);
    addToSet(data.value.envPaths, result.envPaths, true);
  }
  if (data.value.compilerPaths.length && !data.value.settings.compilerPath) {
    data.value.settings.compilerPath = data.value.compilerPaths[0];
  }
  if (data.value.makeToolPaths.length && !data.value.settings.makeToolPath) {
    data.value.settings.makeToolPath = toUnixPath(data.value.makeToolPaths[0]);
  }
  if (data.value.debuggerServerPaths.length && !data.value.settings.debuggerServerPath) {
    data.value.settings.debuggerServerPath = toUnixPath(data.value.debuggerServerPaths[0]);
  }
  if (data.value.settings.projectType === 'Env' && data.value.envPaths.length && !data.value.settings.envPath) {
    data.value.settings.envPath = toUnixPath(data.value.envPaths[0]);
  }
  return result.validateResult;
}

/**
 * 选择RT-Thread Studio安装路径
 *
 * 如果校验路径通过，编译器路径或Make工具路径为空时将自动填充为建议值。
 */
async function onSelectStudioInstallPath() {
  const { folderPath } = await requestExtension({
    command: 'selectFolder',
    params: {},
  });
  data.value.settings.studioInstallPath = toUnixPath(folderPath);
  await validateStudioInstallPath(folderPath);
}

/**
 * 校验下拉选项是否被选中且为选项值之一
 * @param value 选项值
 * @param options 选项列表
 * @param title 标题
 * @returns 校验结果
 */
function validateSelectValue(value: string, options: Array<{ label: string; value: string }>, title: string) {
  const option = options.find((v) => v.value === value);
  if (!option) {
    const validateResult: TdesignCustomValidateResult = {
      result: false,
      message: t('{0} should be one of the option values, please select it again.', [title]),
      type: 'error',
    };
    return validateResult;
  }

  return true;
}

/**
 * 获取选择下拉组件的弹出层宽度
 */
function getSelectPopupWidth(triggerElement: HTMLElement, popupElement: HTMLElement) {
  return {
    width: `${Math.max(triggerElement.clientWidth, popupElement.clientWidth)}px`,
  };
}

/**
 * 请求选择文件并设置表单
 */
async function onSelectFilePath<T extends keyof GenerateSettings = keyof GenerateSettings>(key: T) {
  const { filePath } = await requestExtension({
    command: 'selectFile',
    params: {},
  });
  data.value.settings[key] = toUnixPath(filePath) as GenerateSettings[T];
}

/**
 * 选择RT-Thread Studio安装路径
 */
async function onSelectMakeToolPath() {
  const { folderPath } = await requestExtension({
    command: 'selectFolder',
    params: {},
  });
  data.value.settings.makeToolPath = toUnixPath(folderPath);
}

/**
 * 选择Env根目录
 */
async function onSelectEnvPath() {
  const { folderPath } = await requestExtension({
    command: 'selectFolder',
    params: {},
  });
  data.value.settings.envPath = toUnixPath(folderPath);
}

/**
 * 处理点击生成按钮
 */
async function onFormSubmit() {
  try {
    startLoading(t('Validating the form parameter...'));
    const validateResult = await form.value?.validate();

    // 允许有警告，但不允许有错误
    if (validateResult === false) {
      throw new Error(t('The form fails the validation'));
    } else if (validateResult !== true) {
      for (const key in validateResult) {
        if (Object.prototype.hasOwnProperty.call(validateResult, key)) {
          const list = validateResult[key];
          if (list === true) {
            continue;
          }
          if (list === false) {
            throw new Error(t('The form fails the validation'));
          }
          for (const v of list) {
            if (v.result) {
              continue;
            }
            if (v.type !== 'error') {
              if (v.message) {
                const isConfirm = await new Promise<boolean>((resolve) => {
                  const confirmDia = DialogPlugin({
                    header: t('Warning'),
                    body: v.message,
                    theme: 'warning',
                    zIndex: 4000,
                    confirmBtn: t('Reselect'),
                    onConfirm: () => {
                      confirmDia.hide();
                      resolve(false);
                    },
                    cancelBtn: {
                      content: t('Ignore'),
                      theme: 'warning',
                    },
                    onCancel: () => {
                      confirmDia.hide();
                      resolve(true);
                    },
                    onClose: () => {
                      confirmDia.hide();
                      resolve(false);
                    },
                  });
                });
                if (!isConfirm) {
                  return;
                }
              }
              continue;
            }
            throw new Error(t('The form fails the validation') + ': ' + v.message);
          }
        }
      }
    }
    startLoading(t('Generating...'));
    await requestExtension({
      command: 'generateConfig',
      params: {
        doGenerateParams: JSON.parse(JSON.stringify(data.value)),
      },
    });
  } finally {
    stopLoading();
  }
}

/**
 * 处理vscode扩展发送的消息
 */
async function handleWindowMessage(m: MessageEvent<ExtensionToWebviewDatas>) {
  const { data: msg } = m;
  if (msg.errmsg !== undefined) {
    return;
  }

  switch (msg.command) {
    case 'requestInitialValues':
      if (msg.params.cprojectBuildConfigs?.length && msg.params.settings && !msg.params.settings?.buildConfigName) {
        msg.params.settings.buildConfigName = msg.params.cprojectBuildConfigs[0].name;
      }
      data.value = { ...data.value, ...msg.params };
      if (isLoading.value) {
        try {
          await validateStudioInstallPath(data.value.settings.studioInstallPath);
          if (data.value.settings.projectType === 'Env') {
            await validateEnvPath(data.value.settings.envPath);
          }
        } catch {}
        stopLoading();
      }
      break;

    default:
      break;
  }
}

onMounted(async () => {
  window.addEventListener('message', handleWindowMessage);
  startLoading(t('Parsing project information...'));
  watch(
    () => data.value.settings.debuggerServerPath,
    (v) => {
      const serverType = getDebugServerType(v);
      if (serverType === 'jlink') {
        data.value.settings.debuggerAdapter = 'JLink';
      } else if (serverType === 'stlink') {
        data.value.settings.debuggerAdapter = 'STLink';
      }
    },
  );
  watch(
    () => data.value.settings.projectType,
    async () => {
      try {
        await validateStudioInstallPath(data.value.settings.studioInstallPath);
        if (data.value.settings.envPath) {
          await validateEnvPath(data.value.settings.envPath);
        }
      } catch {}
    },
  );
  requestExtension({ command: 'requestInitialValues', params: {} });
  if (import.meta.env.DEV) {
    data.value.compilerPaths = [
      'd:/RT-ThreadStudio/platform/env_released/env/tools/gnu_gcc/arm_gcc/mingw/bin/arm-none-eabi-gcc',
      'd:/RT-ThreadStudio/repo/Extract/ToolChain_Support_Packages/ARM/GNU_Tools_for_ARM_Embedded_Processors/5.4.1/bin/arm-none-eabi-gcc',
    ];
    data.value.debuggerServerPaths = [
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/SEGGER/J-Link/v7.92/JLink',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/SEGGER/J-Link/v7.50a/JLink',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/pyocd',
    ];
    data.value.cmsisPackPaths = [
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/NXP.MKV10Z1287_DFP.12.1.0-small.pack',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/Keil.STM32L4xx_DFP.2.3.0-small.pack',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/Keil.STM32G0xx_DFP.1.2.0-small.pack',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/Keil.STM32F4xx_DFP.2.14.0-small.pack',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/Keil.STM32F1xx_DFP.2.3.0-small.pack',
      'd:/RT-ThreadStudio/repo/Extract/Debugger_Support_Packages/RealThread/PyOCD/0.1.3/packs/Keil.STM32F0xx_DFP.2.1.0-small.pack',
    ];
  }
});

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage);
});
</script>

<template>
  <div class="m-config-project">
    <div v-if="data.workspaceFolderPicked" class="m-row--center m-workspace-folder" data-test="m-workspace-folder">
      {{ t('Current workspace folder') + ': ' }}
      <code>{{ data.workspaceFolderPicked }}</code>
    </div>

    <TForm ref="form" :data="data" label-align="right" label-width="14em" :rules="formRules">
      <div class="mt2"></div>
      <TFormItem :label="t('Project Type')" name="settings.projectType">
        <TRadioGroup v-model="data.settings.projectType" variant="default-filled">
          <TRadioButton value="RT-Thread Studio">RT-Thread Studio Makefile</TRadioButton>
          <TRadioButton value="Env">RT-Thread Env</TRadioButton>
        </TRadioGroup>
        <template #help>
          <MMarkdown inline :markdown-text="t('The way to build project.')"></MMarkdown>
        </template>
      </TFormItem>

      <template v-if="platform === 'win32'">
        <div class="mt2"></div>
        <TFormItem :label="t('RT-Thread Studio Path')" name="settings.studioInstallPath">
          <TInput
            v-model="data.settings.studioInstallPath"
            clearable
            :placeholder="t('Input or select a folder')"
            @blur="data.settings.studioInstallPath = toUnixPath($event as string)"
          >
          </TInput>
          <FolderOpenIcon class="m-folderopen-icon" @click="onSelectStudioInstallPath" />
          <template #help>
            <MMarkdown
              inline
              :markdown-text="t('RT-Thread Studio installation folder for finding the following tools.')"
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <template v-if="data.settings.projectType === 'Env'">
        <div class="mt2"></div>
        <TFormItem :label="t('Env Tool Path')" name="settings.envPath">
          <MSelectInput
            v-model="data.settings.envPath"
            m-show-all-options
            :options="data.envPaths"
            @blur="data.settings.envPath = toUnixPath($event)"
          ></MSelectInput>
          <FolderOpenIcon class="m-folderopen-icon" @click="onSelectEnvPath" />
          <template #help>
            <MMarkdown
              inline
              :markdown-text="
                t('The root directory of the Env tool, the first level of which should contain the `tools` folder.')
              "
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <div class="mt2"></div>
      <template v-if="data.settings.projectType === 'RT-Thread Studio'">
        <TFormItem :label="t('Build Config')" name="settings.buildConfigName">
          <TSelect
            v-model="data.settings.buildConfigName"
            :readonly="data.cprojectBuildConfigs.length < 2"
            :keys="{
              value: 'name',
              label: 'name',
            }"
            :options="data.cprojectBuildConfigs"
            :show-arrow="data.cprojectBuildConfigs.length >= 2"
            :popup-props="{ overlayInnerStyle: getSelectPopupWidth }"
          >
          </TSelect>
          <template #help>
            <MMarkdown
              inline
              :markdown-text="
                t(
                  'Currently active build configuration. Different configurations are available for different environments or targets, such as `Debug` and `Release` .',
                )
              "
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <div class="mt2"></div>
      <TFormItem :label="t('GCC Compiler Path')" name="settings.compilerPath" required-mark>
        <MSelectInput
          v-model="data.settings.compilerPath"
          m-show-all-options
          :options="data.compilerPaths"
          @blur="data.settings.compilerPath = toUnixPath($event)"
        >
        </MSelectInput>
        <FolderOpenIcon class="m-folderopen-icon" @click="onSelectFilePath('compilerPath')" />
        <template #help>
          <MMarkdown
            inline
            :markdown-text="t('The file path to the GCC compiler (for example, `arm-none-eabi-gcc.exe`).')"
          ></MMarkdown>
        </template>
      </TFormItem>

      <template v-if="data.settings.projectType === 'RT-Thread Studio'">
        <div class="mt2"></div>
        <TFormItem :label="t('Make Tool Path')" name="settings.makeToolPath">
          <TInput
            v-model="data.settings.makeToolPath"
            clearable
            :placeholder="t('Input or select a folder')"
            @blur="data.settings.makeToolPath = toUnixPath($event as string)"
          >
          </TInput>
          <FolderOpenIcon class="m-folderopen-icon" @click="onSelectMakeToolPath" />
          <template #help>
            <MMarkdown
              inline
              :markdown-text="
                t(
                  'The **folder** of make tool. If your make tool PATH has been added to the `PATH` environment variable, you can leave it out.',
                )
              "
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <div class="mt2"></div>
      <TFormItem :label="t('Debugger Server')" name="settings.debuggerServerPath">
        <MSelectInput
          v-model="data.settings.debuggerServerPath"
          m-show-all-options
          :options="data.debuggerServerPaths"
          @blur="data.settings.debuggerServerPath = toUnixPath($event)"
        >
        </MSelectInput>
        <FolderOpenIcon class="m-folderopen-icon" @click="onSelectFilePath('debuggerServerPath')" />
        <template #help>
          <MMarkdown
            inline
            :markdown-text="
              t(
                'The path to the server used for downloading or debugging. Support `openocd`, `pyocd`, `JLink` and `ST-LINK_gdbserver`.',
              )
            "
          ></MMarkdown>
        </template>
      </TFormItem>

      <div class="mt2"></div>
      <TRow>
        <TCol :span="6">
          <TFormItem :label="t('Debugger type')" name="settings.debuggerAdapter">
            <TSelect
              v-model="data.settings.debuggerAdapter"
              :disabled="debuggerServerType === 'stlink' || debuggerServerType === 'jlink'"
              :options="debuggerAdapterOptions"
              :popup-props="{ overlayInnerStyle: getSelectPopupWidth }"
            >
            </TSelect>
            <template #help>
              <MMarkdown
                inline
                :markdown-text="
                  t('The type of debugger to download or debug.') +
                  (debuggerServerType === 'pyocd' ? t('pyocd can be automatically detected, optional.') : '')
                "
              ></MMarkdown>
            </template>
          </TFormItem>
        </TCol>
        <TCol :span="6">
          <TFormItem :label="t('Debugger interface')" name="settings.debuggerInterface">
            <TSelect
              v-model="data.settings.debuggerInterface"
              :options="debuggerInterfaceOptions"
              :popup-props="{ overlayInnerStyle: getSelectPopupWidth }"
            >
            </TSelect>
            <template #help>
              <MMarkdown inline :markdown-text="t('Debugger interface type.')"></MMarkdown>
            </template>
          </TFormItem>
        </TCol>
      </TRow>

      <template v-if="debuggerServerType === 'stlink'">
        <div class="mt2"></div>
        <TFormItem :label="t('External algorithm')" name="settings.stlinkExtload">
          <MSelectInput
            v-model="data.settings.stlinkExtload"
            :m-show-all-options="false"
            :options="data.stlinkExtloadPaths"
            @blur="data.settings.stlinkExtload = toUnixPath($event)"
          >
          </MSelectInput>
          <FolderOpenIcon class="m-folderopen-icon" @click="onSelectFilePath('stlinkExtload')" />
          <template #help>
            <MMarkdown
              inline
              :markdown-text="
                t(
                  'STLink external algorithm file path. If you leave it blank, it indicates that it is not used. This can be an absolute path or a relative path to the project root.',
                )
              "
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <div class="mt2"></div>
      <TFormItem :label="t('Chip Name')" name="settings.chipName">
        <MSelectInput v-model="data.settings.chipName" :m-show-all-options="false" :options="chipNames"> </MSelectInput>
        <template #help>
          <MMarkdown
            inline
            :markdown-text="t('Chip name to download or debug the program (e.g. `STM32F407ZG` )')"
          ></MMarkdown>
        </template>
      </TFormItem>

      <template v-if="debuggerServerType === 'pyocd'">
        <div class="mt2"></div>
        <TFormItem :label="t('Cmsis Pack')" name="settings.cmsisPack">
          <MSelectInput
            v-model="data.settings.cmsisPack"
            :m-show-all-options="false"
            :options="data.cmsisPackPaths"
            @blur="data.settings.cmsisPack = toUnixPath($event)"
          >
          </MSelectInput>
          <FolderOpenIcon class="m-folderopen-icon" @click="onSelectFilePath('cmsisPack')" />
          <template #help>
            <MMarkdown
              inline
              :markdown-text="
                t(
                  'File path of the Cmsis package corresponding to the chip. **If the name of the chip is not [pyOCD Built-in targets] (https://pyocd.io/docs/builtin-targets.html) should be specified.** Built-in packages can be added via the `pyocd pack` related commands.',
                )
              "
            ></MMarkdown>
          </template>
        </TFormItem>
      </template>

      <div class="mt3"></div>
      <TFormItem>
        <div class="m-row--spacebetween" style="width: 100%">
          <TButton :disabled="isLoading" theme="primary" @click="onFormSubmit">{{ t('Generate') }}</TButton>
          <TButton
            variant="text"
            href="https://club.rt-thread.org/ask/article/ce74ef49bc11e858.html#%E5%AF%BC%E5%85%A5%E9%A1%B9%E7%9B%AE"
            theme="default"
          >
            {{ t('Docs') }}
            <template #suffix>
              <HelpCircleIcon />
            </template>
          </TButton>
        </div>
      </TFormItem>
    </TForm>
  </div>
</template>

<style scoped>
.m-workspace-folder {
  text-align: center;
  font-size: 1.2rem;
}

.m-folderopen-icon {
  font-size: 1.5em;
  margin-left: 0.75rem;
  cursor: pointer;
}

.m-config-project {
  margin: 1% 5%;
}
</style>
