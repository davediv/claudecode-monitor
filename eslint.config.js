const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const prettier = require('eslint-config-prettier');
const prettierPlugin = require('eslint-plugin-prettier');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: parser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Response: 'readonly',
        Request: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        Env: 'readonly',
        KVNamespace: 'readonly',
        FetchEvent: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      prettier: prettierPlugin,
    },
    rules: {
      ...typescript.configs['recommended'].rules,
      ...typescript.configs['recommended-requiring-type-checking'].rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': 'off',
    },
  },
  prettier,
  {
    ignores: ['node_modules/', 'dist/', '.wrangler/', 'worker-configuration.d.ts', '*.js', '*.cjs', '*.mjs'],
  },
];