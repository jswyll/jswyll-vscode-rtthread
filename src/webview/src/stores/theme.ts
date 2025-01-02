import { defineStore } from 'pinia';

/**
 * 主题状态
 */
export const useThemeStore = defineStore('mTheme', {
  state: (): {
    /**
     * 当前主题，为`dark`表示深色，否则表示浅色
     */
    theme: string;
  } => {
    return {
      theme: document.documentElement.getAttribute('theme-mode') || '',
    };
  },
  actions: {
    /**
     * 设置主题。页面初始化或用户切换主题时调用
     * @param themeString 主题字符串，为空字符串或`dark`
     */
    setTheme(theme: string) {
      if (theme === 'dark') {
        document.documentElement.setAttribute('theme-mode', 'dark');
      } else {
        document.documentElement.removeAttribute('theme-mode');
      }
      this.theme = theme;
    },
  },
});
