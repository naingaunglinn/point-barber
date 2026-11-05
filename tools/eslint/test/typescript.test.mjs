import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it, vi } from 'vitest';

import { DANGER_ALLOWED, ENUM_SYNTAX, typeChecked } from '../typescript.mjs';
import { withoutTypeAwareRules } from './lib.mjs';

// add-ci-lint-rules · platform-runtime — "CI lints the fixture F": the fixtures of
// tools/eslint/fixtures/typescript/ are linted with typeChecked(["**/*.ts"]) on their own tsconfig,
// because the type-aware rules cannot run on virtual text.
// The first type-aware lint builds the TypeScript program, which is slow on a busy machine.
vi.setConfig({ testTimeout: 60_000 });

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dir = join(root, 'tools/eslint/fixtures/typescript');
const GLOBS = ['**/*.ts', '**/*.tsx'];
const ENUM_LIST = { files: GLOBS, rules: { 'no-restricted-syntax': ['error', ENUM_SYNTAX] } };

const typed = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: GLOBS,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          projectService: false,
          project: [join(dir, 'tsconfig.json')],
          tsconfigRootDir: dir,
        },
      },
    },
    ...typeChecked(GLOBS),
    ENUM_LIST,
  ],
});

// The tests/e2e scenarios need no type information: virtual text, plain parser.
const plain = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: GLOBS, languageOptions: { parser: tseslint.parser } },
    ...withoutTypeAwareRules(typeChecked(GLOBS)),
  ],
});

// Warnings (an unused disable directive) are not violations: CI fails on errors.
const errors = ({ messages }) =>
  messages.filter(({ severity }) => severity === 2).map(({ ruleId, line }) => ({ ruleId, line }));

async function lintFixture(name) {
  const [result] = await typed.lintFiles([join(dir, name)]);
  return errors(result);
}

async function lintText(code, path) {
  const [result] = await plain.lintText(code, { filePath: join(root, path) });
  return errors(result);
}

const ts = (id) => `@typescript-eslint/${id}`;
const comments = (id) => `@eslint-community/eslint-comments/${id}`;

describe('add-ci-lint-rules · TypeScript suppressions', () => {
  it('Scenario: A bare ts-ignore and undescribed disables fail, described ones pass', async () => {
    expect(await lintFixture('suppressions.ts')).toEqual([
      { ruleId: ts('ban-ts-comment'), line: 2 },
      { ruleId: comments('require-description'), line: 5 },
      { ruleId: comments('no-unlimited-disable'), line: 8 },
    ]);
    expect(await lintFixture('ok-suppressions.ts')).toEqual([]);
  });

  it('Scenario: A ts-expect-error needs a description of at least 10 characters', async () => {
    expect(await lintFixture('expect-error.ts')).toEqual([
      { ruleId: ts('ban-ts-comment'), line: 2 },
      { ruleId: ts('ban-ts-comment'), line: 5 },
    ]);
  });

  it('Scenario: No suppression in money, permission or date code (a test of it may)', async () => {
    const code =
      '// @ts-expect-error -- a reason of enough length\nexport const a: number = "a";\n' +
      '// eslint-disable-next-line no-console -- a reason of enough length\nconsole.log(a);\n';
    expect(await lintText(code, 'packages/shared/src/money/sum.ts')).toEqual(
      expect.arrayContaining([
        { ruleId: ts('ban-ts-comment'), line: 1 },
        { ruleId: comments('no-use'), line: 3 },
      ]),
    );
    expect(await lintText(code, 'packages/shared/src/money/sum.test.ts')).toEqual([]);
  });
});

describe('add-ci-lint-rules · any, assertions, enum, switch', () => {
  it('Scenario: JSON.parse used as any fails, unknown plus a schema passes', async () => {
    const found = await lintFixture('unsafe-any.ts');
    for (const expected of [
      { ruleId: ts('no-explicit-any'), line: 1 },
      { ruleId: ts('no-unsafe-assignment'), line: 2 },
      { ruleId: ts('no-unsafe-member-access'), line: 3 },
      { ruleId: ts('no-unsafe-argument'), line: 3 },
      { ruleId: ts('no-unsafe-call'), line: 4 },
      { ruleId: ts('no-unsafe-return'), line: 4 },
    ]) {
      expect(found).toContainEqual(expected);
    }
    expect(await lintFixture('ok-unknown.ts')).toEqual([]);
  });

  it('Scenario: A non-null assertion and a narrowing cast fail, as const passes', async () => {
    expect(await lintFixture('assertions.ts')).toEqual([
      { ruleId: ts('no-non-null-assertion'), line: 3 },
      { ruleId: ts('no-unsafe-type-assertion'), line: 4 },
    ]);
  });

  it('Scenario: An enum fails, an as const object passes', async () => {
    const [result] = await typed.lintFiles([join(dir, 'enum.ts')]);
    expect(result.messages).toEqual([
      expect.objectContaining({
        ruleId: 'no-restricted-syntax',
        line: 1,
        message: expect.stringContaining('CG-TS-04'),
      }),
    ]);
    expect(await lintFixture('ok-const-object.ts')).toEqual([]);
  });

  it('Scenario: A missing member fails even with a default branch', async () => {
    expect(await lintFixture('switch-missing.ts')).toEqual([
      { ruleId: ts('switch-exhaustiveness-check'), line: 4 },
    ]);
    expect(await lintFixture('switch-ok.ts')).toEqual([]);
  });
});

describe('add-ci-lint-rules · mutation, promises, conditions, names, errors, console, sinks', () => {
  it('Scenario: Five mutable patterns fail, the immutable rewrite passes', async () => {
    expect(await lintFixture('mutable.ts')).toEqual([
      { ruleId: 'no-var', line: 1 },
      { ruleId: 'prefer-const', line: 2 },
      { ruleId: 'no-param-reassign', line: 3 },
      { ruleId: 'no-param-reassign', line: 4 },
      { ruleId: ts('prefer-readonly'), line: 5 },
    ]);
    expect(await lintFixture('ok-immutable.ts')).toEqual([]);
  });

  it('Scenario: Floating, misused and non-thenable promises fail', async () => {
    expect(await lintFixture('promises.ts')).toEqual([
      { ruleId: ts('no-floating-promises'), line: 3 },
      { ruleId: ts('no-misused-promises'), line: 4 },
      { ruleId: ts('await-thenable'), line: 5 },
    ]);
    expect(await lintFixture('ok-promises.ts')).toEqual([]);
  });

  it('Scenario: return await is required inside try only', async () => {
    expect(await lintFixture('return-await.ts')).toEqual([{ ruleId: ts('return-await'), line: 2 }]);
  });

  it('Scenario: Implicit conditions fail, explicit ones pass', async () => {
    expect(await lintFixture('conditions.ts')).toEqual([
      { ruleId: ts('strict-boolean-expressions'), line: 2 },
      { ruleId: ts('strict-boolean-expressions'), line: 3 },
      // The nullable `tier.rate` as the left side of `||` is a condition too.
      { ruleId: ts('strict-boolean-expressions'), line: 4 },
      { ruleId: ts('prefer-nullish-coalescing'), line: 4 },
      { ruleId: 'eqeqeq', line: 5 },
      { ruleId: ts('strict-boolean-expressions'), line: 6 },
    ]);
    expect(await lintFixture('ok-conditions.ts')).toEqual([]);
  });

  it('Scenario: snake_case outside a data field fails', async () => {
    expect(await lintFixture('naming.ts')).toEqual([
      { ruleId: ts('naming-convention'), line: 1 },
      { ruleId: ts('naming-convention'), line: 2 },
      { ruleId: ts('naming-convention'), line: 2 },
      { ruleId: ts('naming-convention'), line: 3 },
    ]);
  });

  it('Only __html and __brand may start with a double underscore', async () => {
    expect(await lintFixture('double-underscore.ts')).toEqual([
      { ruleId: ts('naming-convention'), line: 1 },
      { ruleId: ts('naming-convention'), line: 2 },
    ]);
  });

  it('Scenario: Data fields keep their snake_case name', async () => {
    expect(await lintFixture('ok-naming.ts')).toEqual([]);
  });

  it('Scenario: Swallowed and non-Error throws fail', async () => {
    expect(await lintFixture('errors.ts')).toEqual([
      { ruleId: 'no-empty', line: 2 },
      { ruleId: ts('only-throw-error'), line: 3 },
      { ruleId: 'preserve-caught-error', line: 4 },
      { ruleId: ts('use-unknown-in-catch-callback-variable'), line: 5 },
    ]);
    expect(await lintFixture('ok-errors.ts')).toEqual([]);
  });

  it('Scenario: console.log fails', async () => {
    expect(await lintFixture('console.ts')).toEqual([{ ruleId: 'no-console', line: 1 }]);
    expect(await lintFixture('ok-no-console.ts')).toEqual([]);
  });

  it('Scenario: The four sinks fail', async () => {
    expect(await lintFixture('sinks.tsx')).toEqual([
      { ruleId: 'react/no-danger', line: 1 },
      { ruleId: 'no-eval', line: 2 },
      { ruleId: 'no-implied-eval', line: 3 },
      { ruleId: 'no-new-func', line: 4 },
    ]);
    // A function argument is not code in a string, so the timer globals do not make it fail.
    expect(await lintFixture('ok-sinks.tsx')).toEqual([]);
  });
});

describe('add-ci-lint-rules · exports, file names, Node, imports, overrides', () => {
  const only = async (code, path, ruleId) =>
    (await lintText(code, path)).filter((message) => message.ruleId === ruleId);
  const levelOf = async (path, ruleId) =>
    (await typed.calculateConfigForFile(join(root, path))).rules[ruleId]?.[0];

  it('Scenario: A default export fails except where Next.js or a tool needs one', async () => {
    const code = 'export default function format() {}\n';
    const rule = 'import-x/no-default-export';
    expect(await only(code, 'packages/shared/src/format/format-default.ts', rule)).toHaveLength(1);
    for (const path of [
      'apps/web/app/staff/login/page.tsx',
      'packages/i18n/src/request.ts',
      'e2e/global-setup.ts',
      'prisma.config.ts',
    ]) {
      expect(await only(code, path, rule), path).toEqual([]);
    }
  });

  it('Scenario: File names by case', async () => {
    const named = async (path) =>
      (await only('export {};\n', path, 'unicorn/filename-case')).length;
    expect(await named('packages/shared/src/money/Money_Helpers.ts')).toBe(1);
    expect(await named('packages/shared/src/money/MoneyInput.ts')).toBe(1);
    expect(await named('packages/shared/src/money/money-input.ts')).toBe(0);
  });

  it('Scenario: Shared source imports no Node module, its tests and documents may', async () => {
    const code = 'import { readFileSync } from "node:fs";\nexport { readFileSync };\n';
    const rule = 'import-x/no-nodejs-modules';
    expect(await only(code, 'packages/shared/src/money/read-rate.ts', rule)).toHaveLength(1);
    expect(await only(code, 'packages/shared/src/constants/status.test.ts', rule)).toEqual([]);
    expect(await only(code, 'packages/documents/src/receipt/render.ts', rule)).toEqual([]);
  });

  it('Scenario: A two-file cycle fails on both files', async () => {
    const rule = 'import-x/no-cycle';
    for (const name of ['cycle-a.ts', 'cycle-b.ts']) {
      const found = (await lintFixture(name)).filter((message) => message.ruleId === rule);
      expect(found, name).toEqual([{ ruleId: rule, line: 1 }]);
    }
  });

  it('Scenario: A relative path into another package fails, the same package passes', async () => {
    const rule = 'import-x/no-relative-packages';
    expect(await lintFixture('pkg-app/deep.ts')).toEqual([{ ruleId: rule, line: 1 }]);
    expect(await lintFixture('pkg-app/ok.ts')).toEqual([]);
  });

  it('Scenario: Only money.ts may brand a bigint, only the two listed files may inject', async () => {
    const cast = '@typescript-eslint/no-unsafe-type-assertion';
    expect(await levelOf('packages/shared/src/money/money.ts', cast)).toBe(0);
    expect(await levelOf('packages/shared/src/format/money.ts', cast)).toBe(2);
    for (const path of DANGER_ALLOWED) expect(await levelOf(path, 'react/no-danger'), path).toBe(0);
    expect(await levelOf('packages/documents/src/receipt/other.tsx', 'react/no-danger')).toBe(2);
  });
});

describe('add-ci-lint-rules · focused and skipped tests, fixed waits', () => {
  it('Scenario: Focus, skip and fixed waits fail', async () => {
    const unit = 'it.only("adds", () => {});\nit.skip("rounds", () => {});\n';
    expect(await lintText(unit, 'packages/shared/src/money/money.test.ts')).toEqual([
      { ruleId: 'vitest/no-focused-tests', line: 1 },
      { ruleId: 'vitest/no-disabled-tests', line: 2 },
    ]);
    const spec =
      'test.only("signs in", async () => {});\n' +
      'await page.waitForTimeout(1000);\n' +
      'test.skip("later", async () => {});\n';
    expect(await lintText(spec, 'e2e/sign-in.spec.ts')).toEqual([
      { ruleId: 'playwright/no-focused-test', line: 1 },
      { ruleId: 'playwright/no-wait-for-timeout', line: 2 },
      { ruleId: 'playwright/no-skipped-test', line: 3 },
    ]);
  });

  it('Scenario: A conditional project filter passes', async () => {
    const spec =
      'import { test } from "@playwright/test";\n' +
      'declare const width: number;\n' +
      'test.skip(width !== 1280, "sets its own widths; once per language");\n';
    expect(await lintText(spec, 'e2e/dev-ui/layout.spec.ts')).toEqual([]);
  });
});
