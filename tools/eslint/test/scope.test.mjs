import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import config from '../../../eslint.config.mjs';
import { withoutTypeAwareRules } from './lib.mjs';

// add-ci-lint-rules · platform-runtime — "the resolved configuration of P" and the lint scenarios on
// virtual paths, on the composed root configuration (api, web, boundaries). Only the file sets of
// pull request A1 are covered here; the Dev 1 workspaces are added by pull request A4.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const resolved = new ESLint({ cwd: root });
const virtual = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...withoutTypeAwareRules(config),
  ],
});

const configOf = (path) => resolved.calculateConfigForFile(join(root, path));
const severity = async (path, rule) => (await configOf(path)).rules[rule]?.[0];
const options = async (path, rule) => (await configOf(path)).rules[rule]?.slice(1) ?? [];

async function lint(code, path) {
  const [result] = await virtual.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId, line, message }) => ({ ruleId, line, message }));
}

const rule = (ruleId, line, text) => ({
  ruleId,
  line,
  message: text === undefined ? expect.any(String) : expect.stringContaining(text),
});
const NODE_FS = 'import { readFileSync } from "node:fs";\nexport { readFileSync };\n';

describe('add-ci-lint-rules · scope of the A1 file sets', () => {
  it('Scenario: Only the money module may brand a bigint', async () => {
    const id = '@typescript-eslint/no-unsafe-type-assertion';
    expect(await severity('packages/shared/src/money/money.ts', id)).toBe(0);
    expect(await severity('packages/shared/src/format/money.ts', id)).toBe(2);
  });

  it.each([
    'packages/shared/src/format/format.test.ts',
    'packages/documents/src/receipt/receipt.tsx',
    'e2e/edge.spec.ts',
    'prisma.config.ts',
    'apps/api/src/common/database/transaction-runner.ts',
  ])('Scenario: The enum selector is in the list of %s', async (path) => {
    expect(await severity(path, 'no-restricted-syntax')).toBe(2);
    expect(await options(path, 'no-restricted-syntax')).toContainEqual(
      expect.objectContaining({ selector: 'TSEnumDeclaration' }),
    );
  });

  it('Scenario: A default export fails except where a tool needs one', async () => {
    const found = await lint(
      'export default function format() {}\n',
      'packages/shared/src/format/format-default.ts',
    );
    expect(found).toEqual([rule('import-x/no-default-export', 1)]);
    for (const path of ['prisma.config.ts', 'e2e/global-setup.ts', 'e2e/playwright.config.ts']) {
      expect(await severity(path, 'import-x/no-default-export')).toBe(0);
    }
  });

  it('Scenario: File names by case', async () => {
    const named = async (path) =>
      (await lint('export {};\n', path)).filter(({ ruleId }) => ruleId === 'unicorn/filename-case');
    expect(await named('packages/shared/src/money/Money_Helpers.ts')).toHaveLength(1);
    expect(await named('packages/shared/src/money/MoneyInput.ts')).toHaveLength(1);
    expect(await named('packages/shared/src/money/money-input.ts')).toHaveLength(0);
  });

  it('Scenario: A Node import and a browser global in shared source fail', async () => {
    const code = 'import { readFileSync } from "node:fs";\nconst stored = window.localStorage;\n';
    expect(await lint(code, 'packages/shared/src/money/read-rate.ts')).toEqual([
      rule('import-x/no-nodejs-modules', 1),
      rule('no-restricted-globals', 2, 'CG-ARCH-07'),
    ]);
  });

  it('Scenario: Tests and the documents package may use Node, parseFloat still fails', async () => {
    for (const path of [
      'packages/shared/src/constants/status.test.ts',
      'packages/documents/src/receipt/render.ts',
    ]) {
      expect(await lint(NODE_FS, path)).toEqual([]);
    }
    expect(
      await lint(
        'export const x = parseFloat("7000.5");\n',
        'packages/shared/src/money/read-rate.ts',
      ),
    ).toEqual([rule('no-restricted-globals', 1, 'CG-MONEY-01')]);
  });

  it('Scenario: Only the listed files may inject', async () => {
    const receipt = 'packages/documents/src/receipt/receipt.tsx';
    expect(await severity(receipt, 'react/no-danger')).toBe(0);
    expect(
      await severity('packages/documents/src/receipt/receipt-lines.tsx', 'react/no-danger'),
    ).toBe(2);
    expect(readFileSync(join(root, receipt), 'utf8')).toContain('cg-exception CG-SEC-04:');
  });

  it('Scenario: A substitute database fails in shared, documents and e2e', async () => {
    const pg = 'import { newDb } from "pg-mem";\nexport { newDb };\n';
    const sqlite = 'import Database from "better-sqlite3";\nexport { Database };\n';
    expect(await lint(pg, 'packages/shared/src/money/money.test.ts')).toEqual([
      rule('no-restricted-imports', 1, 'CG-TEST-04'),
    ]);
    expect(await lint(sqlite, 'e2e/seed.spec.ts')).toEqual([
      rule('no-restricted-imports', 1, 'CG-TEST-04'),
    ]);
    expect(await lint(pg, 'packages/documents/src/receipt/receipt.test.tsx')).toEqual([
      rule('no-restricted-imports', 1, 'CG-TEST-04'),
    ]);
  });

  it('Scenario: A conditional project filter passes (every real call)', async () => {
    const spec = new ESLint({ cwd: root });
    const results = await spec.lintFiles(['e2e/dev-ui/*.spec.ts']);
    const calls = results.flatMap(({ filePath }) =>
      [...readFileSync(filePath, 'utf8').matchAll(/\btest\.skip\(/g)].map(() => filePath),
    );
    // 17 calls in 9 files on 434fd12; later specs add more, and every one must pass.
    expect(calls.length).toBeGreaterThanOrEqual(17);
    const found = results.flatMap(({ messages }) => messages.map(({ ruleId }) => ruleId));
    expect(found).not.toContain('playwright/no-skipped-test');
    expect(await severity('e2e/dev-ui/layout.spec.ts', 'playwright/no-skipped-test')).toBe(2);
    expect(await options('e2e/dev-ui/layout.spec.ts', 'playwright/no-skipped-test')).toEqual([
      expect.objectContaining({ allowConditional: true }),
    ]);
  }, 60_000);

  it('Scenario: Every importing workspace has the source condition', async () => {
    // The spec's seven workspaces; apps/web is added by pull request A4 (task 8.1).
    const workspaces = [
      'apps/api',
      'packages/documents',
      'packages/shared',
      'packages/ui',
      'packages/i18n',
      'e2e',
    ];
    let importing = 0;
    for (const workspace of workspaces) {
      const manifest = JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8'));
      const own = manifest.name;
      const uses = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }).filter((name) => name.startsWith('@point/') && name !== own);
      if (uses.length === 0) continue;
      importing += 1;
      const tsconfig = readFileSync(join(root, workspace, 'tsconfig.json'), 'utf8');
      expect(tsconfig, `${workspace} imports ${uses.join(', ')}`).toMatch(
        /"customConditions":\s*\[\s*"source"/,
      );
    }
    expect(importing).toBeGreaterThanOrEqual(4);
  });

  it.each([
    'packages/shared/src/money/money.test.ts',
    'e2e/edge.spec.ts',
    'prisma.config.ts',
    'packages/documents/src/receipt/receipt.tsx',
  ])('Scenario: No rule is a warning in %s', async (path) => {
    const { rules } = await configOf(path);
    const named = Object.entries(rules).filter(([id]) =>
      /^(@typescript-eslint\/|@eslint-community\/|import-x\/|unicorn\/|vitest\/|playwright\/|react\/no-danger)/.test(
        id,
      ),
    );
    expect(named.length).toBeGreaterThan(20);
    expect(named.map(([, value]) => value[0]).filter((level) => level === 1)).toEqual([]);
    for (const id of ['no-console', 'no-var', 'eqeqeq', '@typescript-eslint/no-explicit-any']) {
      expect(rules[id]?.[0]).toBe(2);
    }
  });

  // The other half of "No rule is a warning": every rule of this specification that applies to the path
  // is an error (2), so a later object that turns one off for a file set fails here (Dev 1, #57).
  const EVERY_A1_PATH = [
    '@typescript-eslint/ban-ts-comment',
    '@eslint-community/eslint-comments/require-description',
    '@eslint-community/eslint-comments/no-unlimited-disable',
    '@typescript-eslint/no-explicit-any',
    '@typescript-eslint/no-unsafe-assignment',
    '@typescript-eslint/no-unsafe-member-access',
    '@typescript-eslint/no-unsafe-call',
    '@typescript-eslint/no-unsafe-return',
    '@typescript-eslint/no-unsafe-argument',
    '@typescript-eslint/no-non-null-assertion',
    '@typescript-eslint/no-unsafe-type-assertion',
    'no-restricted-syntax',
    '@typescript-eslint/switch-exhaustiveness-check',
    'prefer-const',
    'no-var',
    'no-param-reassign',
    '@typescript-eslint/prefer-readonly',
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/no-misused-promises',
    '@typescript-eslint/await-thenable',
    '@typescript-eslint/return-await',
    'eqeqeq',
    '@typescript-eslint/strict-boolean-expressions',
    '@typescript-eslint/prefer-nullish-coalescing',
    '@typescript-eslint/naming-convention',
    'unicorn/filename-case',
    'import-x/no-cycle',
    'no-eval',
    'no-implied-eval',
    'no-new-func',
    // row 45
    'no-empty',
    '@typescript-eslint/only-throw-error',
    '@typescript-eslint/use-unknown-in-catch-callback-variable',
    'preserve-caught-error',
    // row 78
    'no-console',
    // row 88
    'import-x/no-relative-packages',
  ];
  const ZONED = ['import-x/no-restricted-paths', 'import-x/no-default-export'];
  const VITEST = ['vitest/no-focused-tests', 'vitest/no-disabled-tests'];
  const PLAYWRIGHT = [
    'playwright/no-focused-test',
    'playwright/no-skipped-test',
    'playwright/no-wait-for-timeout',
  ];

  it.each([
    // path, the rules that must be errors there, the rules that must be absent there
    [
      'packages/shared/src/money/money.test.ts',
      [...ZONED, 'react/no-danger', ...VITEST],
      PLAYWRIGHT,
    ],
    [
      'packages/shared/src/format/money.ts',
      // NO_SUPPRESSION: no eslint-disable comment at all in money, permission and date code.
      [...ZONED, 'react/no-danger', '@eslint-community/eslint-comments/no-use'],
      [...VITEST, ...PLAYWRIGHT],
    ],
    // react/no-danger is off here: the allow-list scenario above (cg-exception CG-SEC-04).
    ['packages/documents/src/receipt/receipt.tsx', ZONED, [...VITEST, ...PLAYWRIGHT]],
    ['e2e/edge.spec.ts', [...ZONED, 'react/no-danger', ...PLAYWRIGHT], VITEST],
    // A root config file: no package zone, and its default export is the tool's contract.
    ['prisma.config.ts', ['react/no-danger'], [...VITEST, ...PLAYWRIGHT]],
  ])('Scenario: Every rule of the A1 set is an error in %s', async (path, extra, absent) => {
    const { rules } = await configOf(path);
    for (const id of [...EVERY_A1_PATH, ...extra]) expect(rules[id]?.[0], id).toBe(2);
    for (const id of absent) expect(rules[id], id).toBeUndefined();
  });
});
