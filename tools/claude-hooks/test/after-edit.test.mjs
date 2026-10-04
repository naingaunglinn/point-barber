import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { filePathOf, planFor } from '../lib/plan.mjs';

const hook = resolve(dirname(fileURLToPath(import.meta.url)), '../after-edit.mjs');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// A temporary repository tree: workspaces with and without a tsconfig or a name, root tooling,
// generated folders, and files outside the D17 scope folders.
const FILES = {
  'apps/web/package.json': '{ "name": "web" }',
  'apps/web/tsconfig.json': '{}',
  'apps/web/proxy.ts': '',
  'apps/web/README.md': '',
  'apps/web/.next/types/routes.d.ts': '',
  'apps/web/node_modules/x/index.js': '',
  'packages/ui/package.json': '{ "name": "@point/ui" }',
  'packages/ui/tsconfig.json': '{}',
  'packages/ui/src/index.ts': '',
  'packages/ui/tokens.css': '',
  'packages/shared/package.json': '{ "name": "@point/shared" }',
  'packages/shared/tsconfig.json': '{}',
  'packages/shared/definitions/permissions.json': '[]',
  'packages/plain/package.json': '{}',
  'packages/plain/src/a.ts': '',
  'tools/guards/check-x.mjs': '',
  'db/scripts/migrate.mjs': '',
  'db/migrations/0_baseline/migration.sql': '',
  'e2e/package.json': '{ "name": "e2e" }',
  'e2e/tsconfig.json': '{}',
  'e2e/smoke.spec.ts': '',
  'docs/engineering/README.md': '',
  'CLAUDE.md': '',
  'eslint.config.mjs': '',
};

let base;
let root;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'after-edit-'));
  root = join(base, 'repo');
  for (const [path, text] of Object.entries({ ...FILES, '../sibling/tasks.md': '' })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

function runHook(input) {
  const result = spawnSync(process.execPath, [hook], { input, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// Technical guarantee, no spec scenario: the four steps of design D17 for each kind of file.
describe('tools/claude-hooks — the checks run after an edit (design D17 · CG-AI-08)', () => {
  it('runs every step for a workspace source file', () => {
    expect(planFor(root, 'apps/web/proxy.ts')).toEqual({
      rel: 'apps/web/proxy.ts',
      workspace: 'apps/web',
      eslint: true,
      tsconfig: join(root, 'apps/web/tsconfig.json'),
      vitestProject: 'web',
    });
  });

  it('takes an absolute path as Claude Code sends it', () => {
    expect(planFor(root, join(root, 'packages/ui/src/index.ts'))).toMatchObject({
      rel: 'packages/ui/src/index.ts',
      tsconfig: join(root, 'packages/ui/tsconfig.json'),
      vitestProject: '@point/ui',
    });
  });

  it('only formats a file that is not code', () => {
    for (const path of ['apps/web/README.md', 'packages/ui/tokens.css']) {
      expect(planFor(root, path)).toMatchObject({
        eslint: false,
        tsconfig: null,
        vitestProject: null,
      });
    }
  });

  it('typechecks and tests after a JSON edit, without ESLint', () => {
    expect(planFor(root, 'packages/shared/definitions/permissions.json')).toMatchObject({
      eslint: false,
      tsconfig: join(root, 'packages/shared/tsconfig.json'),
      vitestProject: '@point/shared',
    });
  });

  it('skips tsc for a workspace without a tsconfig and names the project after its folder', () => {
    expect(planFor(root, 'packages/plain/src/a.ts')).toMatchObject({
      workspace: 'packages/plain',
      tsconfig: null,
      vitestProject: 'plain',
    });
  });

  it.each(['tools/guards/check-x.mjs', 'db/scripts/migrate.mjs'])(
    'runs the tooling tests and no tsc for %s',
    (path) => {
      expect(planFor(root, path)).toMatchObject({
        workspace: null,
        eslint: true,
        tsconfig: null,
        vitestProject: 'tooling',
      });
    },
  );

  it('never runs Vitest for the Playwright workspace', () => {
    expect(planFor(root, 'e2e/smoke.spec.ts')).toMatchObject({
      eslint: true,
      tsconfig: join(root, 'e2e/tsconfig.json'),
      vitestProject: null,
    });
  });

  it.each([
    'docs/engineering/README.md',
    'CLAUDE.md',
    'eslint.config.mjs',
    'db/migrations/0_baseline/migration.sql',
    'apps/web/.next/types/routes.d.ts',
    'apps/web/node_modules/x/index.js',
    'apps/web/gone.ts',
    '../sibling/tasks.md',
  ])('leaves %s alone', (path) => {
    expect(planFor(root, path)).toBeNull();
  });

  it('reads the file path from the PostToolUse payload', () => {
    const payload = { tool_name: 'Edit', tool_input: { file_path: '/repo/apps/web/proxy.ts' } };
    expect(filePathOf(JSON.stringify(payload))).toBe('/repo/apps/web/proxy.ts');
    expect(filePathOf('{ "tool_input": {} }')).toBeNull();
    expect(filePathOf('{ "tool_input": { "file_path": "" } }')).toBeNull();
    expect(() => filePathOf('not json')).toThrow();
  });

  it('exits 0 without output for a file outside the scope folders', () => {
    const payload = { tool_name: 'Write', tool_input: { file_path: join(repo, 'CLAUDE.md') } };
    expect(runHook(JSON.stringify(payload))).toEqual({ status: 0, output: '' });
    expect(runHook('{}')).toEqual({ status: 0, output: '' });
  });

  it('reports a payload that is not JSON without blocking Claude (exit 1, not 2)', () => {
    const { status, output } = runHook('not json');
    expect(status).toBe(1);
    expect(output).toContain('after-edit: the hook payload is not JSON');
  });
});
