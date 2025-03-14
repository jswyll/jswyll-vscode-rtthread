<template>
  <TAutoComplete v-model="modelValue" v-bind="computedProps" />
</template>

<script lang="ts" setup>
import { escapeRegExp } from 'lodash';
import { AutoComplete as TAutoComplete, type AutoCompleteOption, type AutoCompleteProps } from 'tdesign-vue-next';
import { computed, ref } from 'vue';

defineOptions({
  inheritAttrs: false,
});

type MSelectInputProps = AutoCompleteProps & {
  /**
   * 是否总是显示所有选项，如果为ture则不管输入是否匹配选项都显示，默认为false
   */
  mShowAllOptions?: boolean;
};

/**
 * 组件属性
 */
const props = defineProps<MSelectInputProps>();

/**
 * 绑定值
 */
const modelValue = defineModel<string>();

/**
 * 是否显示弹出层
 */
const popupVisible = ref(false);

/**
 * 过滤选项
 */
function filterWords(keyword: string, option: AutoCompleteOption) {
  if (props.mShowAllOptions !== undefined) {
    return true;
  }
  const regExp = new RegExp(escapeRegExp(keyword), 'i');
  if (typeof option === 'string') {
    return regExp.test(option);
  }
  if (!option.text) {
    return false;
  }
  return regExp.test(option.text);
}

/**
 * 统计匹配的选项数量
 */
function countMatch(keyword: string, onFirstMatch?: (value: string) => void) {
  let count = 0;
  for (const option of props.options ?? []) {
    if (filterWords(keyword, option)) {
      count++;
      if (count === 1 && onFirstMatch) {
        if (typeof option === 'string') {
          onFirstMatch(option);
        } else if (option.text !== undefined) {
          onFirstMatch(option.text);
        }
      }
    }
  }
  return count;
}

/**
 * 计算属性，用于合并属性和自定义属性
 */
const computedProps = computed<AutoCompleteProps>(() => ({
  ...props,
  highlightKeyword: true,
  filter: props.filterable ? filterWords : undefined,
  onBlur(e) {
    popupVisible.value = false;
    props.onBlur?.(e);
  },
  onChange(value: string) {
    if (value && countMatch(value) === 0) {
      popupVisible.value = false;
    } else {
      popupVisible.value = true;
    }
  },
  onClear() {
    popupVisible.value = true;
  },
  onEnter() {
    let firstMatch;
    if (
      modelValue.value &&
      countMatch(modelValue.value, (value) => {
        firstMatch = value;
      }) === 1
    ) {
      modelValue.value = firstMatch;
      popupVisible.value = false;
    }
  },
  onFocus() {
    if (modelValue.value && countMatch(modelValue.value) === 0) {
      popupVisible.value = false;
    } else {
      popupVisible.value = true;
    }
  },
  onSelect() {
    popupVisible.value = false;
  },
  popupProps: {
    visible: popupVisible.value,
  },
}));
</script>

<style scoped>
.m-select-input-ul-single {
  display: flex;
  flex-direction: column;
  padding: 0;
  gap: 2px;
}

.m-select-input-ul-single > li {
  display: block;
  border-radius: 3px;
  line-height: 22px;
  cursor: pointer;
  padding: 3px 8px;
  color: var(--td-text-color-primary);
  transition: background-color 0.2s linear;
  white-space: nowrap;
  word-wrap: normal;
  overflow: hidden;
  text-overflow: ellipsis;
}

.m-select-input-ul-single > li:hover {
  background-color: var(--td-bg-color-container-hover);
}
</style>
