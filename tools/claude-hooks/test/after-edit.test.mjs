import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { filePathOf, planFor, stepsFor } from '../lib/plan.mjs';

const hook = resolve(dirname(fileURLToPath(import.meta.url)), '../after-edit.mjs');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// A temporary repository tree: code and non-code files in workspaces and root tooling, generated
// folders, and files outside the D17 scope folders.
const FILES = {
  'apps/web/proxy.ts': '',
  'apps/web/README.md': '',
  'apps/web/.next/types/routes.d.ts': '',
  'apps/web/node_modules/x/index.js': '',
  'packages/ui/src/index.ts': '',
  'packages/ui/tokens.css': '',
  'packages/shared/definitions/permissions.json': '[]',
  'tools/guards/check-x.mjs': '',
  'db/scripts/migrate.mjs': '',
  'db/migrations/0_baseline/migration.sql': '',
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

// Technical guarantee, no spec scenario: D17 steps 1 and 2 for each kind of file. Steps 3 and 4
// (tsc and the related unit tests) run in the pre-push check instead — the fallback of task 7.7.
describe('tools/claude-hooks — the checks run after an edit (design D17 · CG-AI-08)', () => {
  it('formats and lints a workspace source file', () => {
    expect(planFor(root, 'apps/web/proxy.ts')).toEqual({ rel: 'apps/web/proxy.ts', eslint: true });
  });

  it('takes an absolute path as Claude Code sends it', () => {
    expect(planFor(root, join(root, 'packages/ui/src/index.ts'))).toEqual({
      rel: 'packages/ui/src/index.ts',
      eslint: true,
    });
  });

  it.each([
    'apps/web/README.md',
    'packages/ui/tokens.css',
    'packages/shared/definitions/permissions.json',
  ])('only formats %s, which ESLint does not lint', (path) => {
    expect(planFor(root, path)).toEqual({ rel: path, eslint: false });
  });

  it.each(['tools/guards/check-x.mjs', 'db/scripts/migrate.mjs', 'e2e/smoke.spec.ts'])(
    'formats and lints %s',
    (path) => {
      expect(planFor(root, path)).toEqual({ rel: path, eslint: true });
    },
  );

  it('starts Prettier, then ESLint on code, and never tsc or Vitest', () => {
    const code = stepsFor(root, planFor(root, 'apps/web/proxy.ts'));
    expect(code.map((step) => step.label)).toEqual(['prettier', 'eslint']);
    expect(code.map((step) => step.args.at(-1))).toEqual([
      join(root, 'apps/web/proxy.ts'),
      join(root, 'apps/web/proxy.ts'),
    ]);
    const text = stepsFor(root, planFor(root, 'apps/web/README.md'));
    expect(text.map((step) => step.label)).toEqual(['prettier']);
  });

  // No type-aware rule is on yet, and building the TypeScript program kept the hook over 10 s on
  // native Windows (PR #8 review). CI and `pnpm lint` keep the full configuration.
  it('lints without the TypeScript program', () => {
    const [, eslint] = stepsFor(root, planFor(root, 'apps/web/proxy.ts'));
    expect(eslint?.args).toEqual(
      expect.arrayContaining(['--parser-options', 'projectService:false']),
    );
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
