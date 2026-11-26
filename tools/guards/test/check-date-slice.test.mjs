import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-date-slice.mjs');
const roots = [];

/** A temporary repository tree: { path: contents }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-date-slice-'));
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

const CUT =
  'cuts a UTC date, not the Myanmar business date; use businessDateOf from packages/shared/src/time (CG-TIME-02)';
const REAL_TREE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('tools/guards/check-date-slice.mjs (§24 row 41 · CG-TIME-02)', () => {
  // Scenario: The UTC slice fails in the example the rule exists for (a sale at 00:40 MMT)
  it('fails on the slice of sale-view.ts with its line and message', () => {
    const lines = Array.from({ length: 42 }, () => '');
    lines.push('const isoDate = (date: Date): string => date.toISOString().slice(0, 10);');
    const { status, err } = run(
      tree({ 'apps/api/src/modules/sales/view/sale-view.ts': lines.join('\n') }),
    );
    expect(status).toBe(1);
    expect(err).toBe(
      `check-date-slice: apps/api/src/modules/sales/view/sale-view.ts:43 — toISOString().slice( ${CUT}\n`,
    );
  });

  // Scenario: `.split(`, a spaced call and `businessDateOf` or a bare `toISOString()`
  it('fails on .split( and a spaced call, and on .substring( and .substr(', () => {
    const { status, err } = run(
      tree({
        'apps/api/src/a.ts':
          'const d = at.toISOString().split("T")[0];\nconst t = at.toISOString() . slice(11, 16);\n',
        'e2e/b.ts':
          'const x = at.toISOString()\n  .substring(0, 10);\nconst y = at.toISOString().substr(0, 10);\n',
      }),
    );
    expect(status).toBe(1);
    expect(err).toBe(
      `check-date-slice: apps/api/src/a.ts:1 — toISOString().split( ${CUT}\n` +
        `check-date-slice: apps/api/src/a.ts:2 — toISOString().slice( ${CUT}\n` +
        `check-date-slice: e2e/b.ts:1 — toISOString().substring( ${CUT}\n` +
        `check-date-slice: e2e/b.ts:3 — toISOString().substr( ${CUT}\n`,
    );
  });

  it('passes businessDateOf, a bare toISOString(), a comment and a folder out of scope', () => {
    const { status, out, err } = run(
      tree({
        'apps/api/src/b.ts':
          'const d = businessDateOf(at);\nconst stamp = at.toISOString();\n// at.toISOString().slice(0, 10)\n',
        'db/seed.mjs': 'const d = at.toISOString().slice(0, 10);\n',
      }),
    );
    expect(status).toBe(0);
    expect(err).toBe('');
    expect(out).toBe('check-date-slice: ok — no toISOString() cut into a date\n');
  });

  // Scenario: A made-up ignore comment does not hide a hit
  it('is not silenced by an ignore comment', () => {
    const { status } = run(
      tree({ 'apps/api/src/a.ts': 'const d = at.toISOString().slice(0, 10); // nolint\n' }),
    );
    expect(status).toBe(1);
  });

  it('the real tree passes once the ten date slices are rewritten', () => {
    expect(run(REAL_TREE).status).toBe(0);
  });
});
