import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { packageZones } from '../boundaries.mjs';
import { typeChecked } from '../typescript.mjs';
import { withoutTypeAwareRules } from './lib.mjs';

// add-ci-lint-rules · platform-runtime — "The graph fixture tree": a miniature of the repository with
// the folder names packages/shared/src, packages/ui/src and apps/web/app/*, a package.json per fake
// package and a tsconfig with `paths` for @point/*, so that import resolution is real. The two web
// trees (site and staff) are added by pull request A4.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tree = join(root, 'tools/eslint/fixtures/graph');
const GLOBS = ['**/*.{ts,tsx}'];

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: GLOBS, languageOptions: { parser: tseslint.parser } },
    ...withoutTypeAwareRules(typeChecked(GLOBS)),
    {
      files: GLOBS,
      settings: {
        'import-x/resolver-next': [
          createTypeScriptImportResolver({ project: [join(tree, 'tsconfig.json')] }),
        ],
      },
    },
    {
      files: GLOBS,
      plugins: { 'import-x': importX },
      rules: { 'import-x/no-restricted-paths': ['error', { zones: packageZones(tree) }] },
    },
  ],
});

async function lint(path) {
  const [result] = await eslint.lintFiles([join(tree, path)]);
  return result.messages.map(({ ruleId, line }) => ({ ruleId, line }));
}

const ZONE = { ruleId: 'import-x/no-restricted-paths', line: 1 };

describe('add-ci-lint-rules · dependencies point one way', () => {
  it('Scenario: A package importing upward fails', async () => {
    expect(await lint('packages/shared/src/money/up.ts')).toEqual([ZONE]);
  });

  it('Scenario: The message files of packages/i18n are data and may be imported', async () => {
    expect(await lint('packages/ui/src/components/ok.tsx')).toEqual([]);
    expect(await lint('packages/shared/src/format/words.ts')).toEqual([]);
  });

  it('Scenario: A two-file cycle fails', async () => {
    expect(await lint('packages/shared/src/cycle/a.ts')).toEqual([
      { ruleId: 'import-x/no-cycle', line: 1 },
    ]);
    expect(await lint('packages/shared/src/cycle/b.ts')).toEqual([
      { ruleId: 'import-x/no-cycle', line: 1 },
    ]);
  });

  it('Scenario: A relative path into packages/shared fails, the package name passes', async () => {
    expect(await lint('apps/web/app/staff/deep.tsx')).toEqual([
      { ruleId: 'import-x/no-relative-packages', line: 1 },
    ]);
    expect(await lint('apps/web/app/staff/front.tsx')).toEqual([]);
  });
});
