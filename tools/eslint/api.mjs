// API lint rules (apps/api, packages/shared) — owner: Dev 2 (design D3).
// The access-decorator rule (design D10), the AD-IMPL-05 parseFloat ban (D16), `$transaction` only
// in src/common/database/ (CG-DB-03) and process.env only in src/common/config/ (CG-SEC-05 · D19).
// One `no-restricted-syntax` entry per file set: a later config object for the same files would
// replace it, not add to it.
import n from 'eslint-plugin-n';

import point from '../eslint-plugin-point/index.mjs';

const API_SOURCE = ['apps/api/src/**/*.ts', 'packages/shared/src/**/*.ts'];

const PARSE_FLOAT =
  'parseFloat — money is an integer number of kyats and is never parsed as a float (CG-MONEY-01 · AD-IMPL-05 · D-PLT-04).';
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
    files: API_SOURCE,
    plugins: { n },
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: PARSE_FLOAT }],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: PARSE_FLOAT },
      ],
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
