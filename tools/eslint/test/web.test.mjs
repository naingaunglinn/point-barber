import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import web from '../web.mjs';

// The fixtures are excluded from `pnpm lint` (root config). Here each one is linted with the rules
// of web.mjs alone, under a path inside apps/web or packages/ui so that the file globs apply.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = join(root, 'tools/eslint/fixtures/web');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...web,
  ],
});

async function lint(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId, message }) => ({ ruleId, message }));
}

function lintFixture(name, path) {
  return lint(readFileSync(join(fixtures, name), 'utf8'), path);
}

const SCOPES = ['apps/web/app', 'packages/ui/src'];

// Technical guarantee, no spec scenario: the AD-IMPL-05 guard rails switched on by design D16 and
// the process.env rule of design D19 — one failing fixture per rule.
describe('tools/eslint/web.mjs (AD-IMPL-05 · design D16 · D19)', () => {
  it.each(SCOPES)('fails on raw UI text in JSX (%s)', async (scope) => {
    expect(await lintFixture('raw-jsx-text.tsx', `${scope}/raw-jsx-text.tsx`)).toEqual([
      { ruleId: 'no-restricted-syntax', message: expect.stringContaining('CG-I18N-01') },
    ]);
  });

  it.each([`<p>{'Hello'}</p>`, '<p>{`Hello`}</p>', `<>{'Hello'}</>`])(
    'fails on a string literal as JSX text: %s',
    async (jsx) => {
      const messages = await lint(`export const x = ${jsx};\n`, 'apps/web/app/x.tsx');
      expect(messages).toEqual([
        { ruleId: 'no-restricted-syntax', message: expect.stringContaining('CG-I18N-01') },
      ]);
    },
  );

  it.each(SCOPES)('fails on a hex colour (%s)', async (scope) => {
    expect(await lintFixture('hex-colour.ts', `${scope}/hex-colour.ts`)).toEqual([
      { ruleId: 'no-restricted-syntax', message: expect.stringContaining('Hex colour') },
    ]);
  });

  it.each(SCOPES)('fails on an arbitrary Tailwind colour class (%s)', async (scope) => {
    expect(
      await lintFixture('arbitrary-colour-class.ts', `${scope}/arbitrary-colour-class.ts`),
    ).toEqual([
      {
        ruleId: 'no-restricted-syntax',
        message: expect.stringContaining('Arbitrary Tailwind colour class'),
      },
    ]);
  });

  it.each(SCOPES)('fails on parseFloat and Number.parseFloat (%s)', async (scope) => {
    expect(await lintFixture('parse-float.ts', `${scope}/parse-float.ts`)).toEqual([
      { ruleId: 'no-restricted-globals', message: expect.stringContaining('CG-MONEY-01') },
      { ruleId: 'no-restricted-properties', message: expect.stringContaining('CG-MONEY-01') },
    ]);
  });

  it.each(SCOPES)('fails on process.env outside apps/web/env.ts (%s)', async (scope) => {
    expect(await lintFixture('process-env.ts', `${scope}/process-env.ts`)).toEqual([
      { ruleId: 'n/no-process-env', message: expect.any(String) },
    ]);
  });

  it('allows process.env in apps/web/env.ts', async () => {
    expect(await lintFixture('process-env.ts', 'apps/web/env.ts')).toEqual([]);
  });

  it.each(SCOPES)('passes expressions and whitespace in JSX (%s)', async (scope) => {
    expect(await lintFixture('expressions-only.tsx', `${scope}/expressions-only.tsx`)).toEqual([]);
  });

  it.each(['href#add', '&#123;', 'bg-[var(--brand)] ring-[3px]'])(
    'does not report %s',
    async (text) => {
      expect(await lint(`export const x = '${text}';\n`, 'apps/web/app/x.ts')).toEqual([]);
    },
  );

  it('does not apply outside apps/web and packages/ui', async () => {
    expect(await lintFixture('hex-colour.ts', 'apps/api/src/hex-colour.ts')).toEqual([]);
  });
});
