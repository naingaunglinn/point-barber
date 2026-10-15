import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-catalogue-flag.mjs');
const roots = [];
const FLAG = 'NEXT_PUBLIC_DEV_CATALOGUE';

const IGNORE = '.env\n.env.*\n**/node_modules\n';
const WEB_PACKAGE = JSON.stringify({
  name: 'web',
  scripts: {
    dev: `cross-env ${FLAG}=1 next dev`,
    build: 'next build',
    'build:catalogue': `cross-env ${FLAG}=1 next build`,
  },
});

/** A clean tree (the flag only in the two scripts) plus the given files. */
function tree(files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-catalogue-flag-'));
  roots.push(root);
  const all = { '.dockerignore': IGNORE, 'apps/web/package.json': WEB_PACKAGE, ...files };
  for (const [path, text] of Object.entries(all)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root) {
  const args = root === undefined ? [guard] : [guard, `--root=${root}`];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// ui-foundation "The catalogue /dev/ui exists only outside the production image" (AD-IMPL-06 ·
// AD-PERM-01 · design D12).
describe('tools/guards/check-catalogue-flag.mjs (AD-IMPL-06 · design D12)', () => {
  it('passes the flag in the dev and build:catalogue scripts of apps/web', () => {
    expect(run(tree()).status).toBe(0);
  });

  it.each([
    ['.env.example', `${FLAG}=1\n`],
    ['.github/workflows/ci.yml', `env:\n  ${FLAG}: '1'\n`],
    ['apps/web/Dockerfile', `FROM node\nENV ${FLAG}=1\n`],
    ['docker-compose.yml', `services:\n  web:\n    environment:\n      ${FLAG}: '1'\n`],
    ['apps/web/next.config.ts', `export default { env: { ${FLAG}: '1' } };\n`],
    ['apps/web/.env.local', `${FLAG}=1\n`],
    ['infra/compose.prod.yaml', `x: ${FLAG}\n`],
  ])(
    'Scenario: The flag in an environment file or a workflow — %s fails and is named',
    (path, text) => {
      const { status, output } = run(tree({ [path]: text }));
      expect(status).toBe(1);
      expect(output).toContain(path);
    },
  );

  it('fails on the flag in another script or another package', () => {
    const other = JSON.stringify({ scripts: { start: `${FLAG}=1 next start` } });
    const web = JSON.parse(WEB_PACKAGE);
    web.scripts.start = `${FLAG}=1 next start`;
    expect(run(tree({ 'apps/web/package.json': JSON.stringify(web) })).output).toContain(
      'apps/web/package.json',
    );
    expect(run(tree({ 'packages/ui/package.json': other })).status).toBe(1);
  });

  it.each([
    ['no .dockerignore', null],
    ['a .dockerignore without .env*', '**/node_modules\n'],
    ['a .dockerignore that excludes only .env', '.env\n'],
  ])('Scenario: Environment files stay out of the image build — %s fails', (_case, text) => {
    const { status, output } = run(tree({ '.dockerignore': text }));
    expect(status).toBe(1);
    expect(output).toContain('.dockerignore');
  });

  it.each(['.env*\n', '**/.env*\n', '.env\n.env.*\n'])(
    'accepts a .dockerignore with %j',
    (text) => {
      expect(run(tree({ '.dockerignore': text })).status).toBe(0);
    },
  );

  it('passes on the real tree', () => {
    expect(run().status).toBe(0);
  });
});
