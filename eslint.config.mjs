/**
 * ESLint flat config for strapi-plugin-magic-mail (ESLint 10).
 *
 * - `@eslint/js` recommended rules for every linted file.
 * - Admin panel: ESM, browser globals, JSX, React Hooks recommended rules.
 * - Server, Strapi entry files and the integration script: CommonJS, Node globals,
 *   `strapi` as a readonly global.
 * - Tests and scripts: Node globals, module type per file extension.
 * - `eslint-config-prettier` last, so formatting stays with Prettier.
 *
 * eslint-plugin-jsx-a11y is not used: its latest release (6.10.2, 2024-10) declares
 * `eslint: ^3 || ... || ^9` as peer range and does not support ESLint 10.
 */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['dist/', 'node_modules/', 'pics/', 'coverage/']),

  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    extends: [js.configs.recommended],
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // `_name` marks a parameter a signature requires but the body does not use;
      // properties destructured next to `...rest` are the documented way to omit fields.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true, reportUsedIgnorePattern: true },
      ],
    },
  },

  // Admin panel (React, browser, ESM)
  {
    files: ['admin/**/*.{js,jsx,mjs}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
  },

  // Server, Strapi entry files and the integration script (Node, CommonJS)
  {
    files: ['server/**/*.js', 'strapi-admin.js', 'strapi-server.js', '.dev/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        // Strapi provides this global to every plugin module at runtime.
        strapi: 'readonly',
      },
    },
  },

  // Node ESM scripts
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Tests (Node test runner): CommonJS .js, ESM .mjs
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  prettier,
]);
