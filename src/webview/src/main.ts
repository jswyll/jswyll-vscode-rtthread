import './assets/app.css';
import 'tdesign-vue-next/es/style/index.css';
import App from './App.vue';
import { i18n } from './locales/i18n';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router';

export const app = createApp(App);
app.config.throwUnhandledErrorInProduction = true;
app.use(i18n).use(createPinia()).use(router).mount('#app');
