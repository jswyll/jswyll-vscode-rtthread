<script setup lang="ts">
import { Input as TInput, type TdInputProps } from 'tdesign-vue-next';
import { computed, ref } from 'vue';

/**
 * 组件属性
 */
const props = defineProps<
  TdInputProps & {
    /**
     * 最小值（含）
     */
    min?: number;

    /**
     * 最大值（含）
     */
    max?: number;
  }
>();

const propsOnChange = props.onChange;

const modelValue = defineModel<string>();

const status = ref<TdInputProps['status']>('default');

const computedProps = computed<TdInputProps>(() => ({
  ...props,
  status: status.value,
  onChange(value) {
    let inputValue = value as string;
    if (!inputValue.startsWith('0x') && !inputValue.startsWith('0X')) {
      inputValue = '0x' + inputValue;
    }
    const match = inputValue.match(/^0[xX][0-9a-fA-F]+/);
    inputValue = match ? match[0] : '';
    modelValue.value = inputValue;
    if (inputValue && !/^0[xX][0-9a-fA-F]+$/.test(inputValue)) {
      status.value = 'error';
    } else {
      const value = parseInt(inputValue, 16);
      if (props.min !== undefined && value < props.min) {
        status.value = 'error';
      } else if (props.max !== undefined && value > props.max) {
        status.value = 'error';
      } else {
        status.value = 'default';
      }
    }
    propsOnChange?.(value);
  },
}));
</script>

<template>
  <TInput v-model="modelValue" v-bind="computedProps"></TInput>
</template>
