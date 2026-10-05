import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import boundaries from '../boundaries.mjs';

// The fixtures are excluded from `pnpm lint` (root config). Here each one is linted with the rules
// of boundaries.mjs alone, under the matching path in apps/api or apps/web so that the globs apply.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = join(root, 'tools/eslint/fixtures/boundaries');

const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...boundaries,
  ],
});

async function lint(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map(({ ruleId }) => ruleId);
}

const fixture = (name) => readFileSync(join(fixtures, name), 'utf8');
const RULE = 'no-restricted-imports';
const imports = (from) => `import { x } from '${from}';\nexport const y = x;\n`;

describe('add-repo-scaffold · platform-runtime · Module boundaries are enforced at build', () => {
  it("Scenario: Reaching into another module's internals fails the build", async () => {
    const code = fixture('modules/sales/reach-in.ts');
    expect(await lint(code, 'apps/api/src/modules/sales/reach-in.ts')).toEqual([RULE]);
  });

  it('Scenario: Importing through the public surface passes', async () => {
    const code = fixture('modules/sales/through-index.ts');
    expect(await lint(code, 'apps/api/src/modules/sales/through-index.ts')).toEqual([]);
  });

  it('Scenario: Database access outside a repository fails the build', async () => {
    const code = fixture('modules/sales/sales.controller.ts');
    expect(await lint(code, 'apps/api/src/modules/sales/sales.controller.ts')).toEqual([RULE]);
  });

  it('Scenario: The web app cannot reach the database', async () => {
    expect(await lint(fixture('web/page.tsx'), 'apps/web/app/staff/page.tsx')).toEqual([RULE]);
  });
});

// Technical guarantees of design D10 beyond the four spec fixtures.
describe('tools/eslint/boundaries.mjs (design D10)', () => {
  it.each([
    [
      'a deeper file reaching into another module',
      'sales/services/a.ts',
      '../../platform/x.js',
      true,
    ],
    [
      'a deeper file through an explicit index.js',
      'sales/services/a.ts',
      '../../platform/index.js',
      false,
    ],
    [
      'a file inside its own module',
      'sales/services/a.ts',
      '../repositories/sale.repository.js',
      false,
    ],
  ])('%s', async (_name, file, from, fails) => {
    const path = `apps/api/src/modules/${file}`;
    expect(await lint(imports(from), path)).toEqual(fails ? [RULE] : []);
  });

  it('app.module imports a module through its index.ts only', async () => {
    const path = 'apps/api/src/app.module.ts';
    expect(await lint(imports('./modules/platform/index.js'), path)).toEqual([]);
    expect(await lint(imports('./modules/platform/platform.module.js'), path)).toEqual([RULE]);
  });

  it('a repository may import the Prisma client', async () => {
    const path = 'apps/api/src/modules/sales/repositories/sale.repository.ts';
    expect(await lint(imports('../../../generated/prisma/client.js'), path)).toEqual([]);
    expect(await lint(imports('@prisma/client'), path)).toEqual([]);
  });

  it('a repository still may not reach into another module', async () => {
    const path = 'apps/api/src/modules/sales/repositories/sale.repository.ts';
    expect(await lint(imports('../../platform/system/system.service.js'), path)).toEqual([RULE]);
  });

  it('src/common/database may import the Prisma client; src/common/http may not', async () => {
    const client = imports('../../generated/prisma/client.js');
    expect(await lint(client, 'apps/api/src/common/database/x.ts')).toEqual([]);
    expect(await lint(client, 'apps/api/src/common/http/x.ts')).toEqual([RULE]);
  });

  it.each([
    'api',
    'api/src/main.js',
    '../../apps/api/src/app.module.js',
    '@prisma/adapter-pg',
    'pg',
    'pg-pool',
    'postgres',
  ])('the web app may not import %s', async (from) => {
    expect(await lint(imports(from), 'apps/web/lib/x.ts')).toEqual([RULE]);
  });

  it('the web app may import the shared package', async () => {
    expect(await lint(imports('@point/shared'), 'apps/web/lib/x.ts')).toEqual([]);
  });
});
