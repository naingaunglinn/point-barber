import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { codeOnly } from '../check-math-random.mjs';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-math-random.mjs');
const roots = [];

/** A temporary repository tree: { path: contents }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-math-random-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [guard, `--root=${root}`], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const CALL = 'export const id = Math.random().toString(36);\n';

// Technical guarantee, no spec scenario: CG-SEC-06 · design D19.
describe('tools/guards/check-math-random.mjs (CG-SEC-06 · design D19)', () => {
  it.each([
    'apps/api/src/modules/sales/id.ts',
    'packages/shared/src/id.ts',
    'apps/api/test/helper.ts',
  ])('fails on Math.random in %s', (path) => {
    const { status, output } = run(tree({ [path]: CALL }));
    expect(status).toBe(1);
    expect(output).toContain(path);
    expect(output).toContain('CG-SEC-06');
  });

  it.each([
    'export const t = `id-${Math.random()}`;\n',
    'export const t = `a ${`b ${Math.random()}`}`;\n',
    "export const x = Math['random']();\n",
    'export const y = Math["random"]();\n',
  ])('fails on %s', (text) => {
    expect(run(tree({ 'apps/api/src/a.ts': text })).status).toBe(1);
  });

  it('fails on a spaced-out call', () => {
    expect(run(tree({ 'apps/api/src/a.ts': 'export const r = Math . random();\n' })).status).toBe(
      1,
    );
  });

  it.each([
    'e2e/tests/data.ts',
    'apps/web/lib/x.ts',
    'apps/api/node_modules/lib/index.js',
    'apps/api/dist/main.js',
  ])('passes when Math.random is only in %s', (path) => {
    const { status, output } = run(tree({ [path]: CALL, 'apps/api/src/main.ts': 'export {};\n' }));
    expect(status).toBe(0);
    expect(output).toContain('ok');
  });

  it('passes when the name appears only in comments and strings', () => {
    const text = [
      '// never Math.random() here',
      '/* Math.random */',
      "export const note = 'Math.random is banned';",
      'export const t = `Math.random()`;',
    ].join('\n');
    expect(run(tree({ 'apps/api/src/a.ts': text })).status).toBe(0);
  });

  it('codeOnly keeps code and blanks comments and strings', () => {
    expect(codeOnly("a(); // b\nc('d e') /* f */ + `g`")).toBe('a(); \nc("")   + ""');
    // A one-word string is kept (a computed member name); a template keeps its ${…} code.
    expect(codeOnly("x['y'] + `a ${z(1)} b`")).toBe('x["y"] + "" z(1) ');
  });

  it('the real tree passes', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    expect(run(root).status).toBe(0);
  });
});
