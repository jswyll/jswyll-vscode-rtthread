<script setup lang="ts">
import GenerateConfig from './views/GenerateConfig.vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { onMounted, onUnmounted, watch } from 'vue';
import { useThemeStore } from './stores/theme';
import { storeToRefs } from 'pinia';

const { theme } = storeToRefs(useThemeStore());

/**
 * 处理全局未捕获的Promise错误
 */
const onUnhandledrejection = (event: PromiseRejectionEvent) => {
  // eslint-disable-next-line no-console
  console.error('app onUnhandledrejection:', event.reason);
  MessagePlugin.error(event.reason.message || event.reason, 3000);
  event.preventDefault();
};

/**
 * 监听全局未捕获的同步错误
 */
const onError = (event: ErrorEvent) => {
  // eslint-disable-next-line no-console
  console.error('app onError:', event.error);
  MessagePlugin.error(event.message, 3000);
  event.preventDefault();
};

onMounted(() => {
  watch(theme, (value: string) => {
    useThemeStore().setTheme(value);
  });
  window.addEventListener('unhandledrejection', onUnhandledrejection);
  window.addEventListener('error', onError);
});

onUnmounted(() => {
  window.removeEventListener('unhandledrejection', onUnhandledrejection);
  window.removeEventListener('error', onError);
});
</script>

<template>
  <div class="m-layout">
    <GenerateConfig></GenerateConfig>
  </div>
</template>

<style scoped>
body {
  background-color: var(--theme-body-background) !important;
}
</style>
