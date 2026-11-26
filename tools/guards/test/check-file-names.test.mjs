import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-file-names.mjs');
const roots = [];

/** A temporary repository tree: { path: contents }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-file-names-'));
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

const MESSAGE =
  'names no role; name the file after what it holds, with its role suffix (CG-NAME-03)';
const REAL_TREE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('tools/guards/check-file-names.mjs (§24 row 13 · CG-NAME-03)', () => {
  // Scenario: A `utils.ts` fails
  it('fails on packages/shared/src/format/utils.ts with the file and the message', () => {
    const { status, err } = run(
      tree({
        'packages/shared/src/format/utils.ts':
          'export const pad = (n: number): string => String(n).padStart(2, "0");\n',
      }),
    );
    expect(status).toBe(1);
    expect(err).toBe(
      `check-file-names: packages/shared/src/format/utils.ts — "utils.ts" ${MESSAGE}\n`,
    );
  });

  // Scenario: A banned name in each of the four forms fails, a folder or a longer name passes
  it('reports helpers.ts, common.tsx, misc.ts and utils.tsx by their paths', () => {
    const { status, err } = run(
      tree({
        'apps/api/src/common/helpers.ts': 'export {};\n',
        'apps/web/lib/common.tsx': 'export {};\n',
        'e2e/misc.ts': 'export {};\n',
        'tools/x/utils.tsx': 'export {};\n',
      }),
    );
    expect(status).toBe(1);
    expect(
      err
        .trimEnd()
        .split('\n')
        .map((line) => line.split(' — ')[0]),
    ).toStrictEqual([
      'check-file-names: apps/api/src/common/helpers.ts',
      'check-file-names: apps/web/lib/common.tsx',
      'check-file-names: e2e/misc.ts',
      'check-file-names: tools/x/utils.tsx',
    ]);
  });

  it('passes a folder with a banned name and a longer file name', () => {
    const { status, out, err } = run(
      tree({
        'apps/api/test/helpers/branches.ts': 'export {};\n',
        'packages/shared/src/format/format-helpers.ts': 'export {};\n',
        'apps/api/src/common/http/problem-exception.ts': 'export {};\n',
        'apps/api/src/utils.js': 'export {};\n',
      }),
    );
    expect(status).toBe(0);
    expect(err).toBe('');
    expect(out).toBe('check-file-names: ok — no file named utils, helpers, common or misc\n');
  });

  // Scenario: A made-up ignore comment does not hide a hit
  it('is not silenced by an ignore comment', () => {
    const { status, err } = run(
      tree({ 'packages/shared/src/format/utils.ts': '// check-ignore\nexport {};\n' }),
    );
    expect(status).toBe(1);
    expect(err).toContain('packages/shared/src/format/utils.ts');
  });

  it('the real tree passes', () => {
    expect(run(REAL_TREE).status).toBe(0);
  });
});
