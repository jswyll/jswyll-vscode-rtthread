<script setup lang="ts">
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { BackTop as TBackTop } from 'tdesign-vue-next';
import { BacktopIcon } from 'tdesign-icons-vue-next';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import xss from 'xss';
import hljs from 'highlight.js/lib/common';
import json from 'highlight.js/lib/languages/json';
import { useFullscreenLoading } from './loading';

/**
 * 组件的属性
 */
const props = defineProps<{
  /**
   * 是否为内联模式
   */
  inline: boolean;

  /**
   * markdown文本
   */
  markdownText?: string;
}>();

const { t } = useI18n();
const { startLoading, stopLoading } = useFullscreenLoading();

/**
 * html内容
 */
const html = ref('');

onMounted(() => {
  marked.use(gfmHeadingId());
  hljs.registerLanguage('jsonc', json);
  hljs.registerLanguage('json', json);
  watch(
    () => props.markdownText,
    async (newValue) => {
      if (newValue === undefined) {
        return;
      }
      startLoading();
      let htmlValue;
      if (props.inline) {
        htmlValue = marked.parseInline(newValue, { async: false });
      } else {
        htmlValue = marked.parse(newValue, { async: false });
      }
      htmlValue = xss(htmlValue, {
        whiteList: {
          a: ['href', 'title', 'target'],
          br: [],
          blockquote: [],
          code: ['class'],
          del: [],
          details: ['markdown'],
          div: [],
          em: [],
          h1: ['id'],
          h2: ['id'],
          h3: ['id'],
          h4: ['id'],
          h5: ['id'],
          h6: ['id'],
          hr: [],
          img: ['src', 'alt', 'title'],
          input: ['disabled', 'type', 'checked'],
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

      nextTick(() => {
        hljs.highlightAll();
        stopLoading();
      });
    },
    { immediate: true },
  );
});
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <span v-if="inline" class="m-markdown-content" v-html="html"></span>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-else class="m-markdown-content" v-html="html"></div>

  <TBackTop shape="circle">
    <BacktopIcon size="24"></BacktopIcon>
    <div>{{ t('Top') }}</div>
  </TBackTop>
</template>

<style>
.m-markdown-content h4 {
  font-size: 1.05rem;
  font-weight: bold;
  display: inline-block;
  padding: 5px 5px 1px 5px;
  border-bottom: 3px solid #169fe6;
  margin-block-start: 0.5rem;
  margin-block-end: 0.5em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
}

.m-markdown-content p {
  font-size: 1rem;
}

.m-markdown-content li p {
  text-indent: 0;
}

.m-markdown-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 5px;
}

.m-markdown-table-outer {
  overflow-x: auto;
}

.m-markdown-content table,
.m-markdown-content table tr th,
.m-markdown-content table tr td {
  border: 1px solid var(--theme-table-border);
}

.m-markdown-content table th {
  background-color: var(--theme-table-th);
}

.m-markdown-content table tr:nth-child(even) {
  background-color: var(--theme-table-even);
}

.m-markdown-content table thead tr th,
.m-markdown-content table tr td {
  padding-left: 8px;
  padding-right: 8px;
  /* TODO: 按照markdown格式渲染 */
  text-align: center;
}

.m-markdown-content img {
  cursor: pointer;
  max-width: 100%;
  height: auto;
  border: var(--theme-border) solid 1px;
  object-fit: contain;
}

.m-markdown-content img[src^="https://img.shields.io"]
{
  border: none;
}

.m-markdown-content h1 {
  text-align: center;
  display: block;
  font-size: 1.5em;
  margin-block-start: 0em;
  margin-block-end: 0.45em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
}

.m-markdown-content h2 {
  padding-bottom: 0.3em;
  font-weight: bold;
  margin: 15px 0;
  font-size: 1.5rem;
  border-bottom: 1px solid var(--theme-border);
}

.m-markdown-content h3 {
  border-left: #169fe6 5px solid;
  display: block;
  font-size: 1.17rem;
  font-weight: bold;
  padding: 5px 0 5px 10px;
  margin-block-start: 1em;
  margin-block-end: 0.5em;
  margin-inline-start: 0px;
  margin-inline-end: 0px;
}

.m-markdown-content p:last-child {
  margin-bottom: 0;
}

.m-markdown-content blockquote {
  color: var(--theme-blockquote-text);
  background-color: var(--theme-blockquote-background);
  font-size: 1rem;
  border-left: 0.2rem solid var(--theme-blockquote-left-border);
  padding: 10px;
  margin: 0.5rem 0;
}

.m-markdown-content blockquote > p {
  margin-top: 0;
}

.m-markdown-content blockquote > :last-child {
  margin-bottom: 0;
}

.m-markdown-content blockquote code {
  background-color: var(--theme-blockquote-code-background);
}

.m-markdown-content blockquote strong {
  font-size: 1.04rem;
  color: var(--theme-blockquote-strong-text);
}

.m-markdown-content pre {
  margin-bottom: 0.5em;
}

.m-markdown-content code {
  padding: 0.2em 0.4em;
  margin: 0;
  white-space: break-spaces;
  word-break: break-all;
  border-radius: 5px;
  color: var(--theme-inline-code--text);
  background-color: var(--theme-inline-code--background);
  font-size: 1em;
}

.m-markdown-content a {
  color: #007bff;
  word-break: break-all;
  text-decoration: none;
}

.m-markdown-content i {
  word-break: break-all;
}

.m-markdown-content img {
  max-width: 100%;
}

.m-markdown-content hr {
  border: none;
  border-top: 1px solid var(--theme-border);
}

.m-markdown-content code table,
.m-markdown-content code table tr th,
.m-markdown-content code table tr td {
  border: none;
  text-align: inherit;
}

.m-markdown-content code table tr:nth-child(even) {
  background-color: inherit;
}

.hljs {
  font-size: 0.9rem;
  color: var(--theme-hljs-text) !important;
  background-color: var(--theme-hljs-background) !important;
  display: block;
  overflow-x: auto;
  padding: 16px !important;
  border: 1px solid var(--theme-border);
  font-family: Consolas, 'Courier New', monospace;
}

.hljs-keyword,
.hljs-type {
  color: var(--theme-hljs-keyword);
}

.hljs-preprocessor {
  color: #7f7f00;
}

.hljs-name {
  color: #01a3a3;
}

.hljs-tag,
.hljs-meta {
  color: var(--theme-hljs-meta);
}

.hljs-comment {
  color: #007f00;
}

.hljs-comment-keyword {
  color: var(--theme-hljs-comment-keyword);
}

.hljs-doctag {
  color: #00cd00;
}

.hljs-title {
  color: var(--theme-hljs-title);
}

.hljs-attribute,
.hljs-selector-tag,
.hljs-doctag,
.hljs-name {
  font-weight: bold;
}

.hljs-meta-string,
.hljs-string {
  color: var(--theme-hljs-string);
}

.hljs-number,
.hljs-selector-id,
.hljs-selector-class,
.hljs-quote,
.hljs-template-tag,
.hljs-deletion {
  color: var(--theme-hljs-number);
}

.hljs-section {
  color: #4286f4;
  font-weight: bold;
}

.hljs-regexp,
.hljs-symbol,
.hljs-variable,
.hljs-template-variable,
.hljs-link,
.hljs-selector-attr,
.hljs-selector-pseudo {
  color: #b00040;
}

.hljs-literal {
  color: #ab003e;
}

.hljs-built_in,
.hljs-bullet,
.hljs-code,
.hljs-addition {
  color: #3374ff;
}

.hljs-emphasis {
  font-style: italic;
}

.hljs-strong {
  font-weight: bold;
}
</style>
