import globals from "globals";

export default [
  {
    ignores: [
      "lib/",
      "node_modules/",
      "test/",
      "store-assets/",
      "eslint.config.mjs",
    ],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: "readonly",
        TurndownService: "readonly",
        Readability: "readonly",
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "error",
      "no-console": "off",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
      "no-undef": "error",
      "no-console": "off",
    },
  },
];
