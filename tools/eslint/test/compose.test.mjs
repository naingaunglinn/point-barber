import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import api from '../api.mjs';
import boundaries from '../boundaries.mjs';
import web from '../web.mjs';
import { withoutTypeChecked } from './lib.mjs';

// add-ci-lint-rules · platform-runtime — "Every existing lint fixture still fails": each fixture is
// linted with the composed configuration in the root order (api, web, boundaries) — the type-aware
// objects left out, because the exact rule ids of the old fixtures were set without them — and compared
// with this table. A later object that replaces a `no-restricted-*` list changes a row and fails here.
// The fixtures of tools/eslint/fixtures/typescript and /graph have their own tests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const API = 'apps/api/src/modules/sales';
const THINGS = 'apps/api/src/modules/things/things.controller.ts';
const one = (id) => [id];
const times = (id, count) => Array.from({ length: count }, () => id);
const SYNTAX = 'no-restricted-syntax';
const GLOBALS = 'no-restricted-globals';
const IMPORTS = 'no-restricted-imports';
const ACCESS = 'point/one-access-decorator';
const MONEY = 'point/no-number-money';
const FORBID = 'react/forbid-elements';
const PROCESS_ENV = 'n/no-process-env';

// fixture -> [path it is linted under, rule ids it must report (none: it must pass)]
const TABLE = {
  'tools/eslint/fixtures/api/parse-float.ts': [`${API}/parse-float.ts`, one(GLOBALS)],
  'tools/eslint/fixtures/api/process-env.ts': [`${API}/process-env.ts`, one(PROCESS_ENV)],
  'tools/eslint/fixtures/api/transaction.ts': [`${API}/sale.service.ts`, one(SYNTAX)],
  'tools/eslint/fixtures/boundaries/modules/sales/reach-in.ts': [
    `${API}/reach-in.ts`,
    one(IMPORTS),
  ],
  'tools/eslint/fixtures/boundaries/modules/sales/sales.controller.ts': [
    `${API}/sales.controller.ts`,
    one(IMPORTS),
  ],
  'tools/eslint/fixtures/boundaries/modules/sales/through-index.ts': [
    `${API}/through-index.ts`,
    [],
  ],
  'tools/eslint/fixtures/boundaries/web/page.tsx': ['apps/web/app/staff/page.tsx', one(IMPORTS)],
  'tools/eslint/fixtures/web/allowed-punctuation.tsx': ['packages/ui/src/marks.tsx', []],
  'tools/eslint/fixtures/web/arbitrary-colour-class.ts': [
    'apps/web/app/arbitrary-colour-class.ts',
    one(SYNTAX),
  ],
  'tools/eslint/fixtures/web/attribute-key.tsx': ['packages/ui/src/attribute-key.tsx', []],
  'tools/eslint/fixtures/web/colour-in-code.tsx': ['apps/web/app/colour.tsx', times(SYNTAX, 7)],
  'tools/eslint/fixtures/web/colour-tokens.tsx': ['packages/ui/src/tokens-ok.tsx', []],
  'tools/eslint/fixtures/web/data-rules.tsx': [
    'packages/ui/src/hooks/use-sales.tsx',
    [SYNTAX, SYNTAX, GLOBALS, SYNTAX, SYNTAX],
  ],
  'tools/eslint/fixtures/web/expressions-only.tsx': ['packages/ui/src/expressions-only.tsx', []],
  'tools/eslint/fixtures/web/hand-made-input.tsx': [
    'apps/web/app/staff/page.tsx',
    [SYNTAX, FORBID],
  ],
  'tools/eslint/fixtures/web/hex-colour.ts': ['packages/ui/src/hex-colour.ts', one(SYNTAX)],
  'tools/eslint/fixtures/web/parse-float.ts': [
    'packages/ui/src/parse-float.ts',
    [GLOBALS, 'no-restricted-properties'],
  ],
  'tools/eslint/fixtures/web/process-env.ts': ['packages/ui/src/process-env.ts', one(PROCESS_ENV)],
  'tools/eslint/fixtures/web/raw-attribute.tsx': ['packages/ui/src/raw-attribute.tsx', one(SYNTAX)],
  'tools/eslint/fixtures/web/raw-jsx-text.tsx': ['apps/web/app/raw-jsx-text.tsx', one(SYNTAX)],
  'tools/eslint-plugin-point/fixtures/all.controller.ts': [THINGS, one(ACCESS)],
  'tools/eslint-plugin-point/fixtures/double.controller.ts': [THINGS, one(ACCESS)],
  'tools/eslint-plugin-point/fixtures/missing.controller.ts': [THINGS, one(ACCESS)],
  'tools/eslint-plugin-point/fixtures/ok.controller.ts': [THINGS, []],
  'tools/eslint-plugin-point/fixtures/float-money.ts': [
    'apps/web/app/sale.ts',
    [GLOBALS, MONEY, MONEY],
  ],
  'tools/eslint-plugin-point/fixtures/sum.ts': ['packages/shared/src/money/sum.ts', []],
};

const composed = withoutTypeChecked([...api, ...web, ...boundaries]);

function engine(extra = []) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
      ...composed,
      ...extra,
    ],
  });
}

/** The rule ids a fixture reports, in the order ESLint gives them. */
async function report(eslint, fixture) {
  const [path] = TABLE[fixture];
  const code = readFileSync(join(root, fixture), 'utf8');
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId }) => ruleId);
}

function walk(folder) {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(folder, entry.name))
      : [relative(root, join(root, folder, entry.name)).replaceAll('\\', '/')],
  );
}

describe('add-ci-lint-rules · every existing lint fixture still fails with the full composition', () => {
  const eslint = engine();

  it('Scenario: The table names every fixture file, and 26 of them', () => {
    const found = [
      'tools/eslint/fixtures/api',
      'tools/eslint/fixtures/boundaries',
      'tools/eslint/fixtures/web',
      'tools/eslint-plugin-point/fixtures',
    ].flatMap(walk);
    expect(found.toSorted()).toEqual(Object.keys(TABLE).toSorted());
    expect(found).toHaveLength(26);
  });

  it.each(Object.keys(TABLE))(
    'Scenario: All 26 fixtures keep their result — %s',
    async (fixture) => {
      expect(await report(eslint, fixture)).toEqual(TABLE[fixture][1]);
    },
  );

  it('Scenario: A replaced list is caught (negative control)', async () => {
    const replaced = engine([
      {
        files: ['packages/ui/**'],
        rules: { [GLOBALS]: ['error', { name: 'localStorage' }] },
      },
    ]);
    const fixture = 'tools/eslint/fixtures/web/parse-float.ts';
    const actual = await report(replaced, fixture);
    // parseFloat is no longer reported, so the comparison with the table fails — as it must.
    expect(actual).not.toEqual(TABLE[fixture][1]);
    expect(actual).not.toContain(GLOBALS);
  });
});
