// API lint rules (apps/api, packages/shared, packages/documents) — owner: Dev 2 (design D3).
// The access-decorator rule (design D10); in apps/api the money rule `point/no-number-money`
// (add-walkin-visit-checkout task 2.9 · design D8 — web.mjs holds it for apps/web and packages/*);
// in every Dev 2 workspace the AD-IMPL-05 parseFloat ban
// (D16) and Math.random (CG-SEC-06, beside the guard of D19); in source only `$transaction` only in
// src/common/database/ (CG-DB-03) and process.env only in src/common/config/ (CG-SEC-05 · D19).
// A rule set by one config object is replaced, not merged, by a later object for the same file, so
// the two file sets below use different rules. The general typescript-eslint rule set is typescript.mjs
// (add-ci-lint-rules): its `typeChecked` objects below are for the A1 file sets, and the lists of this
// file carry the entries that would otherwise be replaced (enum, shared-code globals).
import n from 'eslint-plugin-n';

import point from '../eslint-plugin-point/index.mjs';
import { ENUM_SYNTAX, typeChecked } from './typescript.mjs';

const DEV2_WORKSPACES = [
  'apps/api/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/shared/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/documents/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  // The shared e2e workspace, set up by Dev 2 (task 8.1 · D16 "every workspace").
  'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
];
/** The TypeScript files `typeChecked` covers here; `apps/api` follows with add-ci-lint-api. */
const TYPE_CHECKED = [
  'packages/shared/**/*.{ts,tsx,mts,cts}',
  'packages/documents/**/*.{ts,tsx,mts,cts}',
  'e2e/**/*.{ts,tsx,mts,cts}',
  'prisma.config.ts',
];
// packages/documents is source-only too: its receipt templates read no environment (D19).
const API_SOURCE = [
  'apps/api/src/**/*.ts',
  'packages/shared/src/**/*.ts',
  'packages/documents/src/**/*.{ts,tsx}',
];

const PARSE_FLOAT =
  'parseFloat — money is an integer number of kyats and is never parsed as a float (CG-MONEY-01 · AD-IMPL-05 · D-PLT-04).';
const MATH_RANDOM =
  'Math.random — ids come from uuidV7() and secrets from node:crypto (CG-SEC-06).';
const SHARED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'location',
  'process',
  'Buffer',
  '__dirname',
  '__filename',
].map((name) => ({
  name,
  message: `${name} — packages/shared runs in the browser and on the server, so it uses no browser-only or Node-only global (CG-ARCH-07 · guideline §24 row 21).`,
}));
const TRANSACTION =
  '$transaction outside src/common/database/ — open transactions with TransactionRunner.run (CG-DB-03 · design D4.8).';

export default [
  {
    // Every controller, the test fixtures' included.
    files: ['apps/api/**/*.ts'],
    plugins: { point },
    rules: { 'point/one-access-decorator': 'error' },
  },
  {
    // Money only through the helpers of packages/shared/src/money, in the API too: the mappers convert
    // with moneyToWire / moneyFromWire and there is no global BigInt serializer (CG-MONEY-02 ·
    // CG-MONEY-03 · API-DATA-02 · add-walkin-visit-checkout task 2.9 · guideline §24 row 37).
    files: ['apps/api/**/*.{ts,tsx,mts,cts}'],
    plugins: { point },
    rules: { 'point/no-number-money': 'error' },
  },
  {
    files: DEV2_WORKSPACES,
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: PARSE_FLOAT }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: PARSE_FLOAT },
        { object: 'Math', property: 'random', message: MATH_RANDOM },
      ],
    },
  },
  {
    // Shared code runs in both runtimes (CG-ARCH-07); its tests read definition files. One list with
    // the parseFloat ban above — a later object would replace it.
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: PARSE_FLOAT },
        ...SHARED_GLOBALS,
      ],
    },
  },
  ...typeChecked(TYPE_CHECKED),
  {
    // `enum` in the A1 files that API_SOURCE does not cover (tests, e2e, prisma.config.ts, documents).
    files: TYPE_CHECKED,
    rules: { 'no-restricted-syntax': ['error', ENUM_SYNTAX] },
  },
  {
    files: API_SOURCE,
    plugins: { n },
    rules: {
      'no-restricted-syntax': [
        'error',
        ENUM_SYNTAX,
        { selector: "MemberExpression[property.name='$transaction']", message: TRANSACTION },
      ],
      // CG-SEC-05: the API reads its environment only through src/common/config/.
      'n/no-process-env': 'error',
    },
  },
  {
    files: ['apps/api/src/common/database/**/*.ts'],
    // `$transaction` is allowed here; the enum ban is not.
    rules: { 'no-restricted-syntax': ['error', ENUM_SYNTAX] },
  },
  {
    files: ['apps/api/src/common/config/**/*.ts'],
    rules: { 'n/no-process-env': 'off' },
  },
];
