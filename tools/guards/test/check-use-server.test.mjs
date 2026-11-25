import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-use-server.mjs');
const roots = [];

/** A temporary repository tree: { path: contents }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-use-server-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [guard, `--root=${root}`], { encoding: 'utf8' });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const MESSAGE = "'use server' is not allowed in the web app; call the API instead (CG-ARCH-06)";
const REAL_TREE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('tools/guards/check-use-server.mjs (§24 row 20 · CG-ARCH-06)', () => {
  // Scenario: A file-level and a function-level directive fail
  it('fails on a file-level and a function-level directive, with the lines', () => {
    const inFunction = [
      'export const a = 1;',
      'export const b = 2;',
      'export const c = 3;',
      'export const d = 4;',
      'export const e = 5;',
      'export const f = 6;',
      'export const g = 7;',
      'async function finish() {',
      '  "use server"',
      '}',
    ].join('\n');
    const { status, err } = run(
      tree({
        'apps/web/app/staff/sales/actions.ts': "'use server';\nexport const x = 1;\n",
        'apps/web/components/pos/finish-sale.tsx': inFunction,
      }),
    );
    expect(status).toBe(1);
    expect(err).toBe(
      `check-use-server: apps/web/app/staff/sales/actions.ts:1 — ${MESSAGE}\n` +
        `check-use-server: apps/web/components/pos/finish-sale.tsx:9 — ${MESSAGE}\n`,
    );
  });

  // Scenario: Prose and other apps pass
  it('passes prose, a comment and another app', () => {
    const { status, err } = run(
      tree({
        'apps/web/lib/notes.ts': [
          "// never write 'use server' here (CG-ARCH-06)",
          'const hint = "do not use server actions";',
          "/* 'use server' */",
          '',
        ].join('\n'),
        'apps/api/src/main.ts': "'use server';\n",
      }),
    );
    expect(status).toBe(0);
    expect(err).toBe('');
  });

  // Scenario: A clean tree prints ok and exits 0
  it('prints ok on a clean tree', () => {
    const { status, out, err } = run(
      tree({ 'apps/web/app/site/page.tsx': 'export default function Page() { return null; }\n' }),
    );
    expect(status).toBe(0);
    expect(out).toBe("check-use-server: ok — no 'use server' in apps/web\n");
    expect(err).toBe('');
  });

  // Scenario: A made-up ignore comment does not hide a hit
  it('is not silenced by an ignore comment', () => {
    const { status, err } = run(
      tree({
        'apps/web/app/staff/sales/actions.ts': "// guard-ignore check-use-server\n'use server';\n",
      }),
    );
    expect(status).toBe(1);
    expect(err).toContain('apps/web/app/staff/sales/actions.ts:2 —');
  });

  it('the real tree passes', () => {
    expect(run(REAL_TREE).status).toBe(0);
  });
});
