// Root ESLint config. It only composes the per-owner rule files under tools/eslint/, so the
// two developers never edit the same file (design D3, D10).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import api from './tools/eslint/api.mjs';
import boundaries from './tools/eslint/boundaries.mjs';
import web from './tools/eslint/web.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      // Fixture files that must fail are linted only by their rule tests (design D10).
      'tools/eslint/fixtures/**',
      'tools/eslint-plugin-point/fixtures/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Type-aware TypeScript parsing for every workspace. The general typescript-eslint rule set
    // is switched on by add-ci-guard-rails (guideline §24 rows 3–12).
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
  },
  ...api,
  ...web,
  ...boundaries,
);
