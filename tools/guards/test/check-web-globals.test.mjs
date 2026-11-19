import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-web-globals.mjs');
const roots = [];

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-web-globals-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
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

// Technical guarantee (design D14 row 64 · AD-PWA-02 · AD-A11Y-05 · CG-UI-09): features are detected,
// never guessed from the user agent; the page can always be zoomed.
describe('tools/guards/check-web-globals.mjs (AD-PWA-02 · AD-A11Y-05)', () => {
  it.each([
    [
      'navigator.userAgent',
      'apps/web/app/x.ts',
      'export const ios = /iPhone/.test(navigator.userAgent);\n',
    ],
    [
      'navigator.userAgent',
      'packages/ui/src/x.ts',
      "export const ua = window.navigator['userAgent'];\n",
    ],
    [
      'user-scalable=no',
      'apps/web/app/layout.tsx',
      "export const v = 'width=device-width, user-scalable=no';\n",
    ],
    [
      'userScalable: false',
      'apps/web/app/layout.tsx',
      'export const viewport = { userScalable: false };\n',
    ],
    [
      'maximum-scale=1',
      'apps/web/app/layout.tsx',
      "export const v = 'initial-scale=1, maximum-scale=1';\n",
    ],
    [
      'maximumScale: 1',
      'apps/web/app/layout.tsx',
      'export const viewport = { maximumScale: 1 };\n',
    ],
  ])('fails on %s and names the file', (problem, path, code) => {
    const { status, output } = run(tree({ [path]: code }));
    expect(status).toBe(1);
    expect(output).toContain(path);
    expect(output).toContain(problem);
  });

  it('passes feature detection, a zoomable viewport and comments', () => {
    const root = tree({
      'apps/web/app/layout.tsx':
        "// never user-scalable=no (AD-A11Y-05)\nexport const viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };\n",
      'packages/ui/src/x.ts':
        "export const share = typeof navigator !== 'undefined' && 'share' in navigator;\n",
    });
    expect(run(root).status).toBe(0);
  });

  it('passes on the real tree', () => {
    expect(run().status).toBe(0);
  });
});
