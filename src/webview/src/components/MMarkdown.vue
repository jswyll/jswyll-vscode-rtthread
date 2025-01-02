<script setup lang="ts">
import { marked } from 'marked';
import { ref, watch } from 'vue';
import xss from 'xss';

/**
 * 组件的属性
 */
const props = defineProps<{
  markdownText: string;
}>();

/**
 * html内容
 */
const html = ref('');

watch(
  () => props.markdownText,
  async (newValue) => {
    let htmlValue = marked.parseInline(newValue, { async: false });
    htmlValue = xss(htmlValue, {
      whiteList: {
        a: ['href', 'title', 'target'],
        br: [],
        blockquote: [],
        code: ['class'],
        del: [],
        details: ['markdown'],
        em: [],
        h1: ['id'],
        h2: ['id'],
        h3: ['id'],
        h4: ['id'],
        h5: ['id'],
        h6: ['id'],
        hr: [],
        img: ['src', 'alt', 'title'],
        li: [],
        ol: [],
        p: [],
        pre: [],
        span: ['id'],
        sup: [],
        summary: [],
        strong: [],
        table: [],
        tbody: [],
        td: [],
        tfoot: [],
        th: [],
        thead: [],
        tr: [],
        tt: [],
        u: [],
        ul: [],
      },
    });
    html.value = htmlValue;
  },
  { immediate: true },
);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span v-html="html"></span>
</template>

<style>
a {
  color: #007bff;
  word-break: break-all;
  text-decoration: none;
}

code {
  color: var(--theme-inline-code--text);
  background-color: var(--theme-inline-code--background);
}
</style>
