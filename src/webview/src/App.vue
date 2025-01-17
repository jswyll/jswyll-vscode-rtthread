<script setup lang="ts">
import { useThemeStore } from './stores/theme';
import { storeToRefs } from 'pinia';
import { MessagePlugin } from 'tdesign-vue-next';
import { onMounted, onUnmounted, watch } from 'vue';
import { RouterView } from 'vue-router';
import router from './router';

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
  const path = document.documentElement.getAttribute('path');
  if (path) {
    router.replace(path);
  }
});

onUnmounted(() => {
  window.removeEventListener('unhandledrejection', onUnhandledrejection);
  window.removeEventListener('error', onError);
});
</script>

<template>
  <div class="m-layout">
    <RouterView></RouterView>
  </div>
</template>

<style>
:root {
  --m-app-margin: 8px;
}

body {
  background-color: var(--theme-body-background) !important;
}

a {
  color: #007bff;
  word-break: break-all;
  text-decoration: none;
}

.m-layout {
  margin: var(--m-app-margin);
}
</style>
