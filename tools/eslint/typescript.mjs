// The general typescript-eslint rule set of coding guideline §24 (rows 3–5, 8–13, 45, 52, 72, 78, 88),
// switched on per file set — owner: Dev 2 (add-ci-lint-rules design D2 · D3 · D9).
// `api.mjs` and `web.mjs` each call `typeChecked(files)` for their own workspaces, so a file set outside
// the argument is untouched. The root config already gives every TypeScript file the type-aware parser,
// so no parser is set here. The lists that other files own (`no-restricted-syntax`, `-globals`,
// `-properties`, `-imports`, `import-x/no-restricted-paths`) are not set here: a later object would
// replace them, so their callers add the entries to the existing lists (design D4).
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import vitest from '@vitest/eslint-plugin';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import playwright from 'eslint-plugin-playwright';
import react from 'eslint-plugin-react';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

/** The `no-restricted-syntax` entry for `enum` (CG-TS-04); callers spread it into their list. */
export const ENUM_SYNTAX = {
  selector: 'TSEnumDeclaration',
  message: 'TypeScript enum — use an as const object with the smallint codes (CG-TS-04 · D-DB-03).',
};

/**
 * The files that may use `dangerouslySetInnerHTML`, each with a `cg-exception CG-SEC-04` comment
 * (CG-SEC-04 · CG-META-05 · design D9).
 */
export const DANGER_ALLOWED = [
  'packages/documents/src/receipt/receipt.tsx',
  'packages/ui/src/primitives/chart.tsx',
];

/** The files that must be a default export: Next.js file conventions and tool configs (design D3 row 13). */
export const DEFAULT_EXPORT_ALLOWED = [
  '**/page.tsx',
  '**/layout.tsx',
  '**/error.tsx',
  '**/loading.tsx',
  '**/not-found.tsx',
  '**/global-error.tsx',
  '**/global-not-found.tsx',
  '**/template.tsx',
  '**/default.tsx',
  '**/manifest.ts',
  '**/robots.ts',
  '**/sitemap.ts',
  '**/icon.tsx',
  '**/opengraph-image.tsx',
  'apps/web/proxy.ts',
  '**/*.config.{ts,mts,mjs}',
  // next-intl's request config must be a default export.
  'packages/i18n/src/request.ts',
  // Playwright's global setup.
  'e2e/global-setup.ts',
];

const NAME = 'point/type-checked';

/** Money, permission and date code takes no suppression (CG-TS-01 · design D6.3). */
const NO_SUPPRESSION = [
  'packages/shared/src/money/**',
  'packages/shared/src/permissions/**',
  'packages/shared/src/time/**',
  'packages/shared/src/format/money*',
  'packages/shared/src/format/date-time*',
];

// `source` is how the `exports` of the workspace packages point at `src` (design D7).
const RESOLVER = createTypeScriptImportResolver({
  // One resolver for every workspace's tsconfig: without this it warns on every run.
  noWarnOnMultipleProjects: true,
  conditionNames: ['source', 'types', 'import', 'default'],
  project: [
    'tsconfig.json',
    'apps/*/tsconfig.json',
    'packages/*/tsconfig.json',
    'e2e/tsconfig.json',
  ],
});

const TIMER_GLOBALS = { setTimeout: 'readonly', setInterval: 'readonly', setImmediate: 'readonly' };

const NAMING = [
  'error',
  {
    selector: 'default',
    format: ['camelCase'],
    leadingUnderscore: 'allow',
    trailingUnderscore: 'forbid',
  },
  { selector: 'import', format: null },
  {
    selector: 'variable',
    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
    leadingUnderscore: 'allow',
  },
  { selector: 'variable', modifiers: ['destructured'], format: ['camelCase', 'snake_case'] },
  { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
  { selector: 'parameter', modifiers: ['destructured'], format: ['camelCase', 'snake_case'] },
  { selector: 'function', format: ['camelCase', 'PascalCase'] },
  {
    selector: ['objectLiteralProperty', 'typeProperty', 'classProperty'],
    format: ['camelCase', 'snake_case', 'UPPER_CASE', 'PascalCase'],
  },
  {
    // `__html` (React) and `__brand` (the Mmk brand) are the only names with a double underscore.
    selector: ['objectLiteralProperty', 'typeProperty'],
    filter: { regex: '^__(html|brand)$', match: true },
    format: null,
  },
  {
    selector: ['objectLiteralProperty', 'typeProperty'],
    modifiers: ['requiresQuotes'],
    format: null,
  },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'enumMember', format: ['UPPER_CASE', 'PascalCase'] },
];

const RULES = {
  // Row 3 — suppressions.
  '@typescript-eslint/ban-ts-comment': [
    'error',
    {
      'ts-ignore': true,
      'ts-nocheck': true,
      'ts-check': false,
      'ts-expect-error': 'allow-with-description',
      minimumDescriptionLength: 10,
    },
  ],
  '@eslint-community/eslint-comments/require-description': 'error',
  '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
  // Row 4 — no `any`.
  '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: false, ignoreRestArgs: false }],
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  // Row 5 — no assertions.
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/no-unsafe-type-assertion': 'error',
  // Row 8 — a switch names every member.
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    {
      considerDefaultExhaustiveForUnions: false,
      requireDefaultForNonUnion: false,
      allowDefaultCaseForExhaustiveSwitch: true,
    },
  ],
  // Row 9 — immutability.
  'prefer-const': 'error',
  'no-var': 'error',
  'no-param-reassign': ['error', { props: true }],
  '@typescript-eslint/prefer-readonly': 'error',
  // Row 10 — promises.
  '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true, ignoreIIFE: false }],
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  // Row 11 — explicit conditions (a nullable object is refused too: CG-TS-08).
  eqeqeq: ['error', 'always'],
  '@typescript-eslint/strict-boolean-expressions': [
    'error',
    {
      allowString: false,
      allowNumber: false,
      allowNullableObject: false,
      allowNullableBoolean: false,
      allowNullableString: false,
      allowNullableNumber: false,
      allowNullableEnum: false,
      allowAny: false,
    },
  ],
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
  // Row 12 — snake_case only for data fields.
  '@typescript-eslint/naming-convention': NAMING,
  // Row 13 — named exports and file names.
  'import-x/no-default-export': 'error',
  'unicorn/filename-case': ['error', { case: 'kebabCase' }],
  // Row 18 — cycles (the zones are in boundaries.mjs).
  'import-x/no-cycle': ['error', { maxDepth: 6, ignoreExternal: true }],
  // Row 45 — nothing swallowed.
  'no-empty': ['error', { allowEmptyCatch: false }],
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
  'preserve-caught-error': ['error', { requireCatchParameter: false }],
  // Row 52 — injection sinks.
  'react/no-danger': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  // Row 78 — no console.
  'no-console': 'error',
  // Row 88 — no relative import into another package.
  'import-x/no-relative-packages': 'error',
};

/** `files` ANDed with each of `globs`: a rule never reaches a file outside the caller's set. */
const within = (files, globs) => files.flatMap((file) => globs.map((glob) => [file, glob]));

/**
 * The rule objects for the file set `files`, all named `point/type-checked`.
 * @param {string[]} files globs of TypeScript files, one workspace per entry
 */
export function typeChecked(files) {
  return [
    {
      name: NAME,
      files,
      plugins: {
        '@typescript-eslint': tseslint.plugin,
        '@eslint-community/eslint-comments': comments,
        'import-x': importX,
        unicorn,
        react,
      },
      // `no-implied-eval` finds `setTimeout('code')` only when it knows the global (TypeScript files
      // have none declared).
      languageOptions: { globals: TIMER_GLOBALS },
      settings: {
        // Without the extensions and the parser, `import-x/no-cycle` reads no `.ts` file and reports nothing.
        'import-x/extensions': ['.ts', '.tsx', '.cts', '.mts', '.js', '.jsx', '.cjs', '.mjs'],
        'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'] },
        'import-x/resolver-next': [RESOLVER],
      },
      rules: RULES,
    },
    {
      // The one file that brands a bigint as `Mmk` (CG-MONEY-02 · design D6.2).
      name: NAME,
      files: within(files, ['packages/shared/src/money/money.ts']),
      rules: { '@typescript-eslint/no-unsafe-type-assertion': 'off' },
    },
    {
      name: NAME,
      files: within(files, NO_SUPPRESSION),
      ignores: ['**/*.test.ts'],
      plugins: { '@eslint-community/eslint-comments': comments },
      rules: {
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-ignore': true,
            'ts-nocheck': true,
            'ts-check': false,
            'ts-expect-error': true,
          },
        ],
        '@eslint-community/eslint-comments/no-use': 'error',
      },
    },
    {
      // Row 21 — shared code runs in both runtimes; its tests read definition files (design D6.1).
      name: NAME,
      files: within(files, ['packages/shared/src/**/*.ts']),
      ignores: ['**/*.test.ts'],
      plugins: { 'import-x': importX },
      rules: { 'import-x/no-nodejs-modules': 'error' },
    },
    {
      name: NAME,
      files: within(files, DEFAULT_EXPORT_ALLOWED),
      rules: { 'import-x/no-default-export': 'off' },
    },
    {
      name: NAME,
      files: within(files, DANGER_ALLOWED),
      rules: { 'react/no-danger': 'off' },
    },
    {
      name: NAME,
      files: within(files, ['**/*.test.{ts,tsx}']),
      plugins: { vitest },
      rules: { 'vitest/no-focused-tests': 'error', 'vitest/no-disabled-tests': 'error' },
    },
    {
      // `test.skip(condition, reason)` is a project filter, not a skipped test (design D3 row 72).
      name: NAME,
      files: within(files, ['e2e/**/*.ts']),
      plugins: { playwright },
      rules: {
        'playwright/no-focused-test': 'error',
        'playwright/no-wait-for-timeout': 'error',
        'playwright/no-skipped-test': ['error', { allowConditional: true }],
      },
    },
  ];
}
