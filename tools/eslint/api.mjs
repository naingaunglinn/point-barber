// API lint rules (apps/api, packages/shared, packages/documents) — owner: Dev 2 (design D3).
// The access-decorator rule (design D10); in every Dev 2 workspace the AD-IMPL-05 parseFloat ban
// (D16) and Math.random (CG-SEC-06, beside the guard of D19); in source only `$transaction` only in
// src/common/database/ (CG-DB-03) and process.env only in src/common/config/ (CG-SEC-05 · D19).
// A rule set by one config object is replaced, not merged, by a later object for the same file, so
// the two file sets below use different rules.
import n from 'eslint-plugin-n';

import point from '../eslint-plugin-point/index.mjs';

const DEV2_WORKSPACES = [
  'apps/api/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/shared/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  'packages/documents/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
  // The shared e2e workspace, set up by Dev 2 (task 8.1 · D16 "every workspace").
  'e2e/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
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
    files: API_SOURCE,
    plugins: { n },
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "MemberExpression[property.name='$transaction']", message: TRANSACTION },
      ],
      // CG-SEC-05: the API reads its environment only through src/common/config/.
      'n/no-process-env': 'error',
    },
  },
  {
    files: ['apps/api/src/common/database/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/api/src/common/config/**/*.ts'],
    rules: { 'n/no-process-env': 'off' },
  },
];
