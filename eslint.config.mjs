import globals from 'globals';

export default [
  {
    ignores: ['lib/', 'node_modules/', 'test/', 'scripts/', 'store-assets/', 'eslint.config.mjs'],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
        TurndownService: 'readonly',
        Readability: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'none',
          caughtErrors: 'none',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'error',
      'no-console': 'off',
    },
  },
];
