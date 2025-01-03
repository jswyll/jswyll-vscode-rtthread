import { MessagePlugin } from 'tdesign-vue-next';
import { createI18n } from 'vue-i18n';

export const i18n = createI18n({
  locale: document.documentElement.lang,
  fallbackLocale: 'en',
  messages: {
    /**
     * 中文
     */
    zh: {
      Warning: '警告',
      Yes: '是',
      No: '否',
    },
  },
  missing: (locale, key) => {
    if (import.meta.env.DEV && locale !== 'en' && i18n.global.missingWarn) {
      MessagePlugin.warning(`未翻译 '${locale}' 语言的 '${key}'`);
    }
    return key;
  },
  legacy: false,
});
