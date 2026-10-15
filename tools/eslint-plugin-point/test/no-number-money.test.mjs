import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import api from '../../eslint/api.mjs';
import web from '../../eslint/web.mjs';

// ui-foundation "Lint fails on number arithmetic on money" (AD-IMPL-05 · API-DATA-02 · D-PLT-04 ·
// CG-MONEY-03 · design D14). Linted with web.mjs, which enables the rule (and bans parseFloat in the Dev 1
// workspaces), and api.mjs, which bans parseFloat in packages/shared.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = join(root, 'tools/eslint-plugin-point/fixtures');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...web,
    ...api,
  ],
});

async function lint(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId, line }) => ({ ruleId, line }));
}

const fixture = (name) => readFileSync(join(fixtures, name), 'utf8');
const money = (line) => ({ ruleId: 'point/no-number-money', line });

describe('point/no-number-money', () => {
  it.each(['apps/web/app/sale.ts', 'packages/ui/src/sale.ts', 'packages/shared/src/visit/sale.ts'])(
    'Scenario: Float money — parseFloat, sale.total_amount * 2 and Number(amount) each fail (%s)',
    async (path) => {
      expect(await lint(fixture('float-money.ts'), path)).toEqual([
        { ruleId: 'no-restricted-globals', line: 4 },
        money(5),
        money(6),
      ]);
    },
  );

  it('Scenario: The money module is allowed — packages/shared/src/money/sum.ts adds with +', async () => {
    expect(await lint(fixture('sum.ts'), 'packages/shared/src/money/sum.ts')).toEqual([]);
  });

  it.each([
    'export const x = +amount;',
    'export const x = parseInt(line.price_amount);',
    'export const x = Number.parseInt(totalAmount);',
    "export const x = cell['price_amount'] - 1n;",
    'export const x = (a: bigint) => a + discountAmount;',
    'let total_amount = 0n; total_amount += 5n;',
    'export const x = sale?.total_amount! * 2n;',
  ])('fails on %s', async (code) => {
    const messages = await lint(
      `declare const amount: bigint, line: { price_amount: string }, totalAmount: string, cell: Record<string, bigint>, discountAmount: bigint, sale: { total_amount: bigint } | undefined;\n${code}\n`,
      'packages/ui/src/x.ts',
    );
    expect(messages).toEqual([money(2)]);
  });

  it.each([
    'export const x = count * 2;',
    'export const x = Number(quantity);',
    'export const x = amount === otherAmount;',
    'export const x = formatMoney(amount);',
  ])('passes %s', async (code) => {
    const messages = await lint(
      `declare const count: number, quantity: string, amount: bigint, otherAmount: bigint;\ndeclare function formatMoney(a: bigint): string;\n${code}\n`,
      'apps/web/app/x.ts',
    );
    expect(messages).toEqual([]);
  });

  it('is not enabled for apps/api by this change (add-walkin-visit-checkout task 2.9)', async () => {
    const messages = await lint(fixture('float-money.ts'), 'apps/api/src/sale.ts');
    expect(messages.filter((m) => m.ruleId === 'point/no-number-money')).toEqual([]);
  });
});
