<script setup lang="ts">
import MMarkdown from '@webview/components/MMarkdown.vue';
import { useWebview } from '@webview/components/vscode';
import { onMounted, onUnmounted, ref } from 'vue';
import type { ExtensionToWebviewDatas } from '../../../common/types/type';
import { useFullscreenLoading } from '@webview/components/loading';
import preview from '@webview/mocks/preview.md?raw';

const { requestExtension } = useWebview();

const { startLoading, stopLoading } = useFullscreenLoading();

/**
 * markdown文本
 */
const markdown = ref<string | undefined>(undefined);

/**
 * 处理vscode扩展发送的消息
 */
function handleWindowMessage(m: MessageEvent<ExtensionToWebviewDatas>) {
  const { data: msg } = m;
  if (msg.errmsg !== undefined) {
    return;
  }

  switch (msg.command) {
    case 'updateMarkdownText': {
      const { markdownText } = msg.params;
      markdown.value = markdownText;
      stopLoading();
      break;
    }

    default:
      break;
  }
}

onMounted(async () => {
  startLoading();
  window.addEventListener('message', handleWindowMessage);
  if (import.meta.env.DEV) {
    markdown.value = preview;
  }
  await requestExtension({
    command: 'updateMarkdownText',
    params: {},
  });
});

onUnmounted(() => {
  window.removeEventListener('message', handleWindowMessage);
});
</script>

<template>
  <div class="m-markdowndoc-container">
    <MMarkdown :inline="false" :markdown-text="markdown"></MMarkdown>
  </div>
</template>
<style scoped>
.m-markdowndoc-container {
  --m-app-margin: 0;
  margin: 16px 24px;
}
</style>
