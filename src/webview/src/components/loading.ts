import { LoadingPlugin, type LoadingInstance } from 'tdesign-vue-next';
import { ref } from 'vue';

/**
 * 全屏加载实例
 */
let loadingInstance: LoadingInstance | null = null;

/**
 * 上一次加载的提示语
 */
let lastLoadingText = '';

/**
 * 状态 - 是否正在全屏加载
 */
const isLoading = ref(false);

/**
 * 组合式函数 - 全屏加载
 */
export function useFullscreenLoading() {
  /**
   * 开始全屏加载
   * @param text 加载提示语
   */
  const startLoading = (text?: string) => {
    if (loadingInstance) {
      if (text === lastLoadingText) {
        return;
      } else {
        stopLoading();
      }
    }

    loadingInstance = LoadingPlugin({ fullscreen: true, text });
    lastLoadingText = text ?? '';
    isLoading.value = true;
  };

  /**
   * 结束全屏加载
   */
  const stopLoading = () => {
    if (!loadingInstance) {
      return;
    }

    loadingInstance.hide();
    loadingInstance = null;
    isLoading.value = false;
  };

  return {
    startLoading,
    stopLoading,
    isLoading,
  };
}
