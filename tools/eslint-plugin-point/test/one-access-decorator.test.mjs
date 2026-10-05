import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import api from '../../eslint/api.mjs';
import point from '../index.mjs';
import { ROUTE_DECORATORS } from '../rules/one-access-decorator.mjs';

// The fixtures are excluded from `pnpm lint` (root config); here each one is linted with the rule
// alone, under a path inside apps/api so that the api.mjs file globs apply too.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = join(root, 'tools/eslint-plugin-point/fixtures');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    { files: ['**/*.ts'], plugins: { point }, rules: { 'point/one-access-decorator': 'error' } },
  ],
});

async function lint(code, path = 'apps/api/src/modules/things/things.controller.ts') {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId, line }) => ({ ruleId, line }));
}

const fixture = (name) => readFileSync(join(fixtures, name), 'utf8');
const lineOf = (code, text) => code.split('\n').findIndex((line) => line.includes(text)) + 1;

describe('add-repo-scaffold · platform-runtime · Every endpoint declares exactly one access decorator', () => {
  it('Scenario: Missing decorator fails the build', async () => {
    const code = fixture('missing.controller.ts');
    expect(await lint(code)).toEqual([
      { ruleId: 'point/one-access-decorator', line: lineOf(code, 'list()') },
    ]);
  });

  it('Scenario: Second decorator fails the build', async () => {
    const code = fixture('double.controller.ts');
    expect(await lint(code)).toEqual([
      { ruleId: 'point/one-access-decorator', line: lineOf(code, 'list()') },
    ]);
  });

  it('Scenario: A catch-all handler is covered too', async () => {
    const code = fixture('all.controller.ts');
    expect(await lint(code)).toEqual([
      { ruleId: 'point/one-access-decorator', line: lineOf(code, 'any()') },
    ]);
  });

  it('Scenario: Exactly one decorator passes', async () => {
    expect(await lint(fixture('ok.controller.ts'))).toEqual([]);
  });

  it('Scenario: The real controllers pass', async () => {
    // The whole rule set of api.mjs, on the real files, as `pnpm lint` runs it.
    const real = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
        ...api,
      ],
    });
    const results = await real.lintFiles([
      'apps/api/src/modules/platform/system/health.controller.ts',
      'apps/api/src/modules/platform/system/status.controller.ts',
    ]);
    for (const result of results) {
      expect(result.messages.filter((m) => m.ruleId === 'point/one-access-decorator')).toEqual([]);
      expect(readFileSync(result.filePath, 'utf8')).toMatch(/@Public\(\)/);
    }
    expect(results).toHaveLength(2);
  });

  // Technical guarantee: every remaining route decorator is covered, not only @Get and @All.
  it.each(ROUTE_DECORATORS.filter((name) => name !== 'Get' && name !== 'All'))(
    'a @%s() endpoint without an access decorator fails',
    async (name) => {
      const code = `@Controller('x')\nexport class X {\n  @${name}()\n  handle() {}\n}\n`;
      expect(await lint(code)).toEqual([{ ruleId: 'point/one-access-decorator', line: 4 }]);
    },
  );

  it('a class that is not a controller is not checked', async () => {
    expect(await lint(`export class X {\n  @Get()\n  handle() {}\n}\n`)).toEqual([]);
  });

  it('a namespaced decorator (@common.Get()) is recognised', async () => {
    const code = `@common.Controller('x')\nexport class X {\n  @common.Get()\n  handle() {}\n}\n`;
    expect(await lint(code)).toEqual([{ ruleId: 'point/one-access-decorator', line: 4 }]);
  });
});
