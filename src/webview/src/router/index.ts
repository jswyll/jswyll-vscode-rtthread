import MHome from '@webview/components/MHome.vue';
import GenerateConfig from '@webview/views/GenerateConfig.vue';
import MenuConfig from '@webview/views/MenuConfig.vue';
import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory('/'),

  // vscode加载多个小文件的负担比加载一个大文件的大，所以不拆分文件
  routes: [
    {
      path: '/',
      component: MHome,
    },
    {
      path: '/view/generate',
      component: GenerateConfig,
    },
    {
      path: '/view/menuconfig',
      component: MenuConfig,
    },
  ],
});

export default router;
