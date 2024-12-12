import { MessagePlugin } from 'tdesign-vue-next';
import { createI18n } from 'vue-i18n';

export const i18n = createI18n({
  locale: document.documentElement.lang,
  fallbackLocale: 'en',
  formatFallbackMessages: true,
  messages: {},
  missing: (locale, key) => {
    if (import.meta.env.DEV && locale !== 'en') {
      MessagePlugin.warning(`未翻译 '${locale}' 语言的 '${key}'`);
    }
    return key;
  },
});
