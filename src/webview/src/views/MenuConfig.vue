<script setup lang="ts">
import { debounce, escapeRegExp } from 'lodash';
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import {
  DialogPlugin,
  BackTop as TBackTop,
  Button as TButton,
  Checkbox as TCheckbox,
  Col as TCol,
  Divider as TDivider,
  Form as TForm,
  FormItem as TFormItem,
  Input as TInput,
  InputNumber as TInputNumber,
  Option as TOption,
  Row as TRow,
  Select as TSelect,
  Tree as TTree,
  type InputValue,
  type SelectValue,
  type TreeProps,
} from 'tdesign-vue-next';
import BacktopIcon from 'tdesign-icons-vue-next/esm/components/backtop';
import InputHex from '@webview/components/InputHex.vue';
import { treeData } from '@webview/mocks/menuconfig';
import { useWebview } from '@webview/components/vscode';
import type { MenuItemHex, MenuItemInt, TMenuItem } from '../../../common/types/menuconfig';
import type { ExtensionToWebviewDatas } from '../../../common/types/type';
import { useI18n } from 'vue-i18n';
import { toHexString, vueI18nEscape, vueI18nUnescape } from '../../../common/utils.ts';
import menuconfigZhCn from '@webview/locales/menuconfig.zh-cn.json';
import { i18n } from '@webview/locales/i18n.ts';
import { useFullscreenLoading } from '@webview/components/loading.ts';

/**
 * 菜单配置的简体中文翻译
 */
type menuconfigZhCnMessageSchema = typeof menuconfigZhCn;

const { requestExtension } = useWebview();

/**
 * 页面的简体中文翻译
 */
const pageI18n = {
  ': ': '：',
  Reload: '重新加载',
  Save: '保存',
  'Value entered is out of range({0}-{1})': '输入的值超出范围（{0}-{1}）',
  'Search configuration, which supports entering keywords in name, title, or help':
    '搜索配置，支持输入名称、标题或帮助中的关键词',
  'There are unsaved changes. Sure to proceed?': '存在未保存的更改，确认继续操作？',
  name: '名称',
  prompt: '提示',
  range: '范围',
  help: '帮助',
};

/**
 * 翻译
 */
const { t } = useI18n<[menuconfigZhCnMessageSchema & typeof pageI18n], 'zh'>({
  /**
   * 消息源
   */
  messages: {
    /**
     * 中文
     */
    zh: { ...menuconfigZhCn, ...pageI18n },
  },
});

const { startLoading, stopLoading } = useFullscreenLoading();

/**
 * 树控件的引用
 */
const treeRef = ref<InstanceType<typeof TTree>>();

/**
 * 菜单节点数据
 */
const treeItems = ref<TMenuItem[]>([]);

/**
 * 高亮的菜单节点编号
 */
const actived = ref<number[]>([]);

/**
 * 菜单节点编号展开状态
 */
const expanded = ref<number[]>([]);

/**
 * 过滤条件
 */
const filter = ref<TreeProps['filter']>(undefined);

/**
 * 搜索文本
 */
const searchText = ref('');

/**
 * 菜单节点编号-错误信息
 */
const idToErrorMap: Record<number, string> = {};

/**
 * 是否发生更改
 */
let isHasChanged = false;

/**
 * 底部提示信息
 */
const bottomTip = ref<string>('');

/**
 * 消抖搜索
 */
const searchDebounced = debounce(
  (keyword: string) => {
    const searchText = keyword.trim();
    const regex = new RegExp(escapeRegExp(searchText), 'i');

    if ((!searchText || searchText.length < 3) && filter.value !== undefined) {
      filter.value = undefined;
      return;
    }

    filter.value = ({ data }) => {
      return (
        regex.test(data.name) ||
        regex.test(data.prompt) ||
        regex.test(data.help) ||
        regex.test(data.translatedPrompt) ||
        regex.test(data.translatedHelp)
      );
    };
  },
  300,
  { leading: false, trailing: true },
);

/**
 * 处理点击菜单节点
 */
const handleClickTree: TreeProps['onClick'] = async (node) => {
  const treeItem = node.node.data as TMenuItem;
  bottomTip.value = treeItem.info;
  if (searchText.value) {
    // 取消过滤状态并跳转到目标节点
    searchText.value = '';
    filter.value = undefined;
    await nextTick();
    const paths = treeRef.value!.getPath(treeItem.id);
    expanded.value = paths.map((v) => v.data.id);
    await nextTick();
    setTimeout(() => {
      const element = document.getElementById(`m-menuconfig-${treeItem.id}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 150);
  }
  actived.value = [treeItem.id];
};

/**
 * 处理Symbol或Choice的值发生变化
 */
async function handleScChange(id: number, value: string | number | boolean) {
  const ret = await requestExtension({
    command: 'changeMenuItem',
    params: {
      id: id,
      value,
    },
  });
  if (ret.result) {
    isHasChanged = true;
  }
  return ret;
}

/**
 * 处理布尔菜单值发生变化
 */
async function handleBoolChange(node: TMenuItem, value: boolean) {
  try {
    startLoading();
    const { result } = await handleScChange(node.id, value);
    if (value && result) {
      if (!expanded.value.includes(node.id)) {
        expanded.value.push(node.id);
      }
    }
  } finally {
    stopLoading();
  }
}

/**
 * 处理字符串菜单值发生变化
 */
async function handleStringChange(node: TMenuItem, value: string | number) {
  await handleScChange(node.id, value);
}

/**
 * 处理INT或Hex菜单值发生变化
 */
async function handleIntChange(node: MenuItemInt | MenuItemHex, value: string | number) {
  let isValid = true;
  if (node.range) {
    const [min, max] = node.range;
    const base = node.type === 'INT' ? 10 : 16;
    const valueInt = parseInt(value.toString(), base);
    if (!(valueInt >= min && valueInt <= max)) {
      isValid = false;
      const errmsg = t('Value entered is out of range({0}-{1})', [
        node.type === 'INT' ? min.toString() : toHexString(min),
        node.type === 'INT' ? max.toString() : toHexString(max),
      ]);
      idToErrorMap[node.id] = errmsg;
      throw new Error(errmsg);
    }
  }
  if (isValid) {
    delete idToErrorMap[node.id];
    await handleScChange(node.id, value);
  }
}

/**
 * 处理选择菜单值发生变化
 */
async function handleChoiceChange(options: TMenuItem[], index: SelectValue) {
  const selectOption = options[index as number];
  handleBoolChange(selectOption, true);
}

/**
 * 处理点击重新加载按钮
 */
async function handleReload() {
  if (isHasChanged) {
    const isConfirm = await new Promise<boolean>((resolve) => {
      const confirmDia = DialogPlugin({
        header: t('Warning'),
        body: t('There are unsaved changes. Sure to proceed?'),
        theme: 'warning',
        zIndex: 4000,
        confirmBtn: {
          content: t('No'),
          theme: 'default',
        },
        onConfirm: () => {
          confirmDia.hide();
          resolve(false);
        },
        cancelBtn: {
          content: t('Yes'),
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
  await loadData();
}

/**
 * 处理搜索
 */
function handleSearchTextChange(keyword: InputValue) {
  actived.value = [];
  searchDebounced(keyword.toString());
}

/**
 * 处理点击保存按钮
 */
async function handleSave() {
  for (const key in idToErrorMap) {
    const errmsg = idToErrorMap[key];
    throw new Error(errmsg);
  }
  try {
    startLoading();
    await requestExtension({
      command: 'saveMenuconfig',
      params: {},
    });
    isHasChanged = false;
  } finally {
    stopLoading();
  }
}

/**
 * 处理vscode扩展发送的消息
 */
function handleWindowMessage(m: MessageEvent<ExtensionToWebviewDatas>) {
  const { data: msg } = m;
  if (msg.errmsg !== undefined) {
    return;
  }

  switch (msg.command) {
    case 'setMenuconfigData': {
      treeItems.value = msg.params;
      tralateMenuconfig();
      break;
    }

    default:
      break;
  }
}

/**
 * 翻译菜单配置
 */
function tralateMenuconfig() {
  function rec(treeItems: TMenuItem[]) {
    for (const item of treeItems) {
      item.translatedPrompt = vueI18nUnescape(t(vueI18nEscape(item.prompt)));
      if (item.help) {
        item.translatedHelp = vueI18nUnescape(t(vueI18nEscape(item.help)));
      }
      rec(item.children);
    }
  }
  i18n.global.missingWarn = false;
  i18n.global.fallbackWarn = false;
  rec(treeItems.value);
  i18n.global.missingWarn = true;
  i18n.global.fallbackWarn = true;
}

/**
 * 加载数据
 */
async function loadData() {
  try {
    startLoading();
    const { menus, hasChanged, warnings } = await requestExtension({
      command: 'getMenuconfigData',
      params: {},
    });
    treeItems.value = menus;
    tralateMenuconfig();
    bottomTip.value = warnings.join('\r\n');
    isHasChanged = hasChanged;
  } finally {
    stopLoading();
  }
}

onMounted(async () => {
  window.addEventListener('message', handleWindowMessage);
  loadData();
  if (import.meta.env.MODE === 'development') {
    treeItems.value = treeData;
    tralateMenuconfig();
    stopLoading();
  }
});

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage);
});
</script>

<template>
  <div class="m-menuconfig-container">
    <TRow justify="center" :gutter="10">
      <TCol>
        <TButton theme="default" @click="handleReload"> {{ t('Reload') }} </TButton>
      </TCol>
      <TCol class="m-page-serach">
        <TInput
          v-model="searchText"
          clearable
          :placeholder="t('Search configuration, which supports entering keywords in name, title, or help')"
          @change="handleSearchTextChange"
          @focus="bottomTip = ''"
        ></TInput>
      </TCol>
      <TCol>
        <TButton @click="handleSave"> {{ t('Save') }} </TButton>
      </TCol>
    </TRow>
    <div class="m-page-body">
      <TForm>
        <TTree
          ref="treeRef"
          v-model:actived="actived"
          v-model:expanded="expanded"
          activable
          :data="treeItems"
          :expand-level="0"
          expand-on-click-node
          expand-parent
          :filter="filter"
          hover
          :keys="{ label: 'prompt', value: 'id' }"
          :transition="false"
          @click="handleClickTree"
        >
          <template #label="{ node }: { node: { data: TMenuItem } }">
            <div :id="'m-menuconfig-' + node.data.id">
              <TFormItem
                v-if="node.data.type === 'CHOICE'"
                class="mb1"
                :label="node.data.translatedPrompt || node.data.prompt"
                label-align="top"
                :name="node.data.name"
              >
                <TSelect v-model="node.data.controlValue" @change="handleChoiceChange(node.data.options, $event)">
                  <TOption
                    v-for="(item, index) in node.data.options"
                    :key="item.id"
                    :label="item.prompt"
                    :value="index"
                  ></TOption>
                </TSelect>
                <template v-if="node.data.help" #help>
                  {{ node.data.translatedHelp || node.data.help }}
                </template>
              </TFormItem>
              <TFormItem
                v-else-if="node.data.type === 'BOOL'"
                :class="{ mb1: node.data.help }"
                label-align="left"
                label-width="0"
                :name="node.data.name"
              >
                <TRow :align="'center'">
                  <TCol class="m-row--center">
                    <TCheckbox
                      v-model="node.data.controlValue"
                      @change="handleBoolChange(node.data, $event)"
                    ></TCheckbox>
                  </TCol>
                  <TCol>
                    {{ node.data.translatedPrompt || node.data.prompt }}
                  </TCol>
                </TRow>
                <template v-if="node.data.help" #help>
                  {{ node.data.translatedHelp || node.data.help }}
                </template>
              </TFormItem>
              <TFormItem
                v-else-if="node.data.type === 'STRING'"
                class="mb1"
                :label="node.data.translatedPrompt || node.data.prompt"
                label-align="top"
                :name="node.data.name"
              >
                <TInput v-model="node.data.controlValue" @blur="handleStringChange(node.data, $event)"></TInput>
                <template v-if="node.data.help" #help>
                  {{ node.data.translatedHelp || node.data.help }}
                </template>
              </TFormItem>
              <TFormItem
                v-else-if="node.data.type === 'HEX'"
                class="mb1"
                :label="node.data.translatedPrompt || node.data.prompt"
                label-align="top"
                :name="node.data.name"
              >
                <InputHex
                  v-model="node.data.controlValue"
                  :min="node.data.range?.[0]"
                  :max="node.data.range?.[1]"
                  @blur="handleIntChange(node.data, $event)"
                ></InputHex>
                <div class="mb3"></div>
                <template v-if="node.data.help" #help>
                  {{ node.data.translatedHelp || node.data.help }}
                </template>
              </TFormItem>
              <TFormItem
                v-else-if="node.data.type === 'INT'"
                class="mb1"
                :label="node.data.translatedPrompt || node.data.prompt"
                label-align="top"
                :name="node.data.name"
              >
                <TInputNumber
                  v-model="node.data.controlValue"
                  :decimal-places="0"
                  :min="node.data.range?.[0]"
                  :max="node.data.range?.[1]"
                  theme="normal"
                  style="width: 100%"
                  @blur="handleIntChange(node.data, $event)"
                ></TInputNumber>
                <template v-if="node.data.help" #help>
                  {{ node.data.translatedHelp || node.data.help }}
                </template>
              </TFormItem>
              <span v-else :class="{ 'm-page-comment': node.data.type === 'COMMENT' }">
                {{ node.data.translatedPrompt || node.data.prompt }}
              </span>
            </div>
          </template>
        </TTree>
      </TForm>
    </div>
    <div v-show="bottomTip" class="m-page-footer">
      <TDivider dashed></TDivider>
      <div class="m-page-footer__tip">{{ bottomTip }}</div>
    </div>
  </div>
  <TBackTop shape="circle">
    <BacktopIcon size="24"></BacktopIcon>
    <div>{{ t('Top') }}</div>
  </TBackTop>
</template>

<style>
.t-tree--transition .t-tree__item--visible {
  max-height: initial !important;
}

.t-input__help {
  white-space: normal;
}

.t-tree__item + .t-tree__item {
  margin-top: 6px;
}

.m-menuconfig-container {
  height: calc(100vh - 2 * var(--m-app-margin, 0));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.m-page-body {
  margin-top: 8px;
  padding-right: 4px;
  overflow: auto;
  flex: 1;
}

.m-page-footer {
  --td-comp-margin-xxl: 10px;
}

.m-page-footer__tip {
  border: 1px solid var(--td-border-level-2-color);
  border-radius: var(--td-radius-default);
  padding: calc(calc(var(--td-comp-size-m) - var(--td-line-height-body-medium)) / 2) var(--td-comp-paddingLR-s);
  white-space: pre-wrap;
  font: var(--td-font-body-medium);
  max-height: 50vh;
  overflow-y: auto;
}

.m-page-comment {
  color: #6a9955;
}

.m-page-serach {
  width: 50%;
}
</style>
