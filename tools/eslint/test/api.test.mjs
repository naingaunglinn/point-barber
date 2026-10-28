import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import api from '../api.mjs';

// The fixtures are excluded from `pnpm lint` (root config). Here each one is linted with the rules
// of api.mjs alone, under a path inside apps/api or packages/shared so that the file globs apply.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = join(root, 'tools/eslint/fixtures/api');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...api,
  ],
});

async function lint(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId, message }) => ({ ruleId, message }));
}

const fixture = (name) => readFileSync(join(fixtures, name), 'utf8');
const SCOPES = ['apps/api/src/modules/sales', 'packages/shared/src'];

// Technical guarantee, no spec scenario: the API rules of design D16 and D19 — one failing fixture
// per rule, and the one place each rule is switched off.
describe('tools/eslint/api.mjs (AD-IMPL-05 · CG-DB-03 · CG-SEC-05 · design D16 · D19)', () => {
  it.each(SCOPES)('fails on parseFloat (%s)', async (scope) => {
    expect(await lint(fixture('parse-float.ts'), `${scope}/parse-float.ts`)).toEqual([
      { ruleId: 'no-restricted-globals', message: expect.stringContaining('CG-MONEY-01') },
    ]);
  });

  // D16: parseFloat is banned in every workspace — the API's tests and scripts and
  // packages/documents too.
  it.each([
    'apps/api/test/helpers/x.ts',
    'apps/api/scripts/x.mjs',
    'apps/api/vitest.int.config.ts',
    'packages/documents/src/x.ts',
    // The receipt templates of add-walkin-visit-checkout are React components (PR #4 review).
    'packages/documents/src/receipt.tsx',
    'packages/documents/src/receipt.jsx',
    // The shared e2e workspace (task 8.1 · D16 "every workspace" · guideline §24 row 37).
    'e2e/edge.spec.ts',
    'e2e/helpers/raw-request.ts',
    'e2e/playwright.config.ts',
  ])('fails on parseFloat in %s', async (path) => {
    expect(await lint(fixture('parse-float.ts'), path)).toEqual([
      { ruleId: 'no-restricted-globals', message: expect.stringContaining('CG-MONEY-01') },
    ]);
  });

  // CG-SEC-06: the parser sees every form of Math.random, also inside a template literal.
  it.each([
    'export const a = Math.random();\n',
    "export const b = Math['random']();\n",
    'export const c = `id-${Math.random()}`;\n',
  ])('fails on Math.random: %s', async (code) => {
    expect(await lint(code, 'apps/api/src/modules/sales/id.ts')).toEqual([
      { ruleId: 'no-restricted-properties', message: expect.stringContaining('CG-SEC-06') },
    ]);
  });

  it('fails on Number.parseFloat', async () => {
    expect(await lint(`export const x = Number.parseFloat('1.5');\n`, 'apps/api/src/x.ts')).toEqual(
      [{ ruleId: 'no-restricted-properties', message: expect.stringContaining('CG-MONEY-01') }],
    );
  });

  it('fails on $transaction outside src/common/database/', async () => {
    expect(
      await lint(fixture('transaction.ts'), 'apps/api/src/modules/sales/sale.service.ts'),
    ).toEqual([{ ruleId: 'no-restricted-syntax', message: expect.stringContaining('CG-DB-03') }]);
  });

  it('allows $transaction in src/common/database/', async () => {
    expect(
      await lint(fixture('transaction.ts'), 'apps/api/src/common/database/transaction-runner.ts'),
    ).toEqual([]);
  });

  it.each(SCOPES)('fails on process.env outside the config module (%s)', async (scope) => {
    expect(await lint(fixture('process-env.ts'), `${scope}/process-env.ts`)).toEqual([
      { ruleId: 'n/no-process-env', message: expect.any(String) },
    ]);
  });

  // D19: packages/documents reads no environment (PR #5 review).
  it.each(['packages/documents/src/x.ts', 'packages/documents/src/receipt.tsx'])(
    'fails on process.env in %s',
    async (path) => {
      expect(await lint(fixture('process-env.ts'), path)).toEqual([
        { ruleId: 'n/no-process-env', message: expect.any(String) },
      ]);
    },
  );

  it('allows process.env in src/common/config/', async () => {
    expect(await lint(fixture('process-env.ts'), 'apps/api/src/common/config/config.ts')).toEqual(
      [],
    );
  });

  it('switches point/one-access-decorator on for apps/api', async () => {
    const code = `@Controller('x')\nexport class X {\n  @Get()\n  handle() {}\n}\n`;
    expect(await lint(code, 'apps/api/src/modules/sales/x.controller.ts')).toEqual([
      { ruleId: 'point/one-access-decorator', message: expect.stringContaining('API-PERM-02') },
    ]);
  });

  it('fails on the undeclared fixture route, which the root config therefore excludes', async () => {
    const path = 'apps/api/test/fixtures/undeclared.controller.ts';
    expect(await lint(readFileSync(join(root, path), 'utf8'), path)).toEqual([
      { ruleId: 'point/one-access-decorator', message: expect.stringContaining('API-PERM-02') },
    ]);
  });
});
