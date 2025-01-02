import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  build: {
    chunkSizeWarningLimit: 1024,
    emptyOutDir: true,
    outDir: '../../out/webview',
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@webview': resolve(__dirname, 'src'),
    },
  },
  plugins: [vue()],
});
