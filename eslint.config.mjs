import pluginVue from 'eslint-plugin-vue';
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import vueTsEslintConfig from '@vue/eslint-config-typescript';
import jswyllPlugin from './src/dev/must-use-await-for-function.js';

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
  },

  ...pluginVue.configs['flat/recommended'],

  ...vueTsEslintConfig(),

  skipFormatting,

  {
    rules: {
      'no-console': 'error',
      'vue/component-name-in-template-casing': ['warn', 'PascalCase'],
      'eqeqeq': 'error',
    },
  },

  {
    plugins: {
      jswyll: jswyllPlugin,
    },
    rules: {
      'jswyll/must-use-await-for-function': [
        'error',
        [
          { functionName: 'existsAsync' },
          { functionName: 'updateConfig' },
          { functionName: 'getFileType' },
        ],
      ],
    },
  },
];
