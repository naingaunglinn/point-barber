import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-bigint-tojson.mjs');
const roots = [];

/** A temporary repository tree: { path: contents }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-bigint-tojson-'));
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
  'BigInt.prototype.toJSON turns amounts into strings or lossy numbers; convert with moneyToWire from packages/shared/src/money (CG-MONEY-02)';
const REAL_TREE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('tools/guards/check-bigint-tojson.mjs (§24 row 38 · CG-MONEY-02)', () => {
  // Scenario: A global patch fails in each form, `toJSON` of another object passes
  it('fails on the global patch in both forms, with the lines and the message', () => {
    const { status, err } = run(
      tree({
        'apps/api/src/main.ts':
          "import x from 'x';\n\n\nBigInt.prototype.toJSON = function () { return this.toString(); };\n",
        'apps/web/lib/setup.ts':
          'import x from "x";\nObject.defineProperty(BigInt.prototype, "toJSON", { value() { return Number(this); } });\n',
      }),
    );
    expect(status).toBe(1);
    expect(err).toBe(
      `check-bigint-tojson: apps/api/src/main.ts:4 — ${MESSAGE}\n` +
        `check-bigint-tojson: apps/web/lib/setup.ts:2 — ${MESSAGE}\n`,
    );
  });

  it.each([
    "BigInt.prototype['toJSON'] = f;",
    'BigInt . prototype . toJSON = f;',
    "Object.defineProperty(BigInt.prototype, 'toJSON', {});",
    // TypeScript refuses the bare assignment, so a real patch is written through a cast.
    '(BigInt.prototype as any).toJSON = f;',
    '(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = () => "1";',
    "(BigInt.prototype as any)['toJSON'] = f;",
    "Object.defineProperty(BigInt.prototype as object, 'toJSON', {});",
  ])('fails on %s', (line) => {
    expect(run(tree({ 'packages/shared/src/a.ts': `${line}\n` })).status).toBe(1);
  });

  it('passes toJSON of another object, a comment and a different prototype', () => {
    const { status, out, err } = run(
      tree({
        'packages/ui/src/components/Chart/Chart.test.tsx':
          'const chart = { toJSON: () => ({}) };\n',
        'apps/api/src/openapi/document.ts': 'const s = z.toJSONSchema(zodSchema);\n',
        'apps/api/src/note.ts':
          '// BigInt.prototype.toJSON is banned\nDate.prototype.toJSON = f;\n',
        'apps/api/src/other.ts':
          'const p = (BigInt.prototype as any).toString; const s = box.toJSON();\n',
      }),
    );
    expect(status).toBe(0);
    expect(err).toBe('');
    expect(out).toBe('check-bigint-tojson: ok — no BigInt toJSON patch\n');
  });

  it('the real tree passes', () => {
    expect(run(REAL_TREE).status).toBe(0);
  });
});
