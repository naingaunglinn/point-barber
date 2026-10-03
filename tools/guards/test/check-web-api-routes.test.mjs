import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-web-api-routes.mjs');
const roots = [];

/** A temporary repository tree holding the given files. */
function tree(paths) {
  const root = mkdtempSync(join(tmpdir(), 'check-web-api-routes-'));
  roots.push(root);
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), 'export function GET() {}\n');
  }
  return root;
}

function run(...args) {
  const result = spawnSync(process.execPath, [guard, ...args], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('add-repo-scaffold · platform-runtime · The web app defines no route handler under /api', () => {
  it('Scenario: A route handler under /api fails the build', () => {
    const { status, output } = run(`--root=${tree(['apps/web/app/staff/api/ping/route.ts'])}`);
    expect(status).toBe(1);
    expect(output).toContain('apps/web/app/staff/api/ping/route.ts');
    expect(output).toContain('CG-ARCH-06');
  });

  it('Scenario: The real tree passes', () => {
    expect(run().status).toBe(0);
  });
});

// The other cases of design D10: any depth, any route handler extension, nothing else.
describe('check-web-api-routes (ADR-009 · API-SHAPE-01 · design D10)', () => {
  it.each([
    'apps/web/app/api/route.js',
    'apps/web/app/site/api/route.ts',
    'apps/web/app/(group)/api/a/b/route.tsx',
  ])('fails on %s', (path) => {
    const { status, output } = run(`--root=${tree([path])}`);
    expect(status).toBe(1);
    expect(output).toContain(path);
  });

  it.each([
    'apps/web/app/internal/revalidate/route.ts',
    'apps/web/app/site/apis/route.ts',
    'apps/web/app/staff/api/page.tsx',
  ])('passes %s', (path) => {
    expect(run(`--root=${tree([path])}`).status).toBe(0);
  });
});
