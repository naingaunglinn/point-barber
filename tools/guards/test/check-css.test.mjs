import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-css.mjs');
const roots = [];

/** A temporary repository tree: { 'path/file.css': 'content' }. */
function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-css-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
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

// Technical guarantee, no spec scenario (the ui-foundation requirement is written by
// add-shared-ui-components): colours and fonts in CSS live only in packages/ui/tokens.css.
describe('check-css (CG-UI-05 · AD-IMPL-05 · design D16)', () => {
  it('fails on a hex colour outside packages/ui/tokens.css and names the file', () => {
    const root = tree({ 'apps/web/app/site.css': '.hero {\n  color: #DC5F00;\n}\n' });
    const { status, output } = run(`--root=${root}`);
    expect(status).toBe(1);
    expect(output).toContain('apps/web/app/site.css:2');
    expect(output).toContain('CG-UI-05');
  });

  it('fails on font-family outside packages/ui/tokens.css', () => {
    const root = tree({ 'packages/ui/src/button.css': '.b { font-family: Inter, sans-serif; }\n' });
    const { status, output } = run(`--root=${root}`);
    expect(status).toBe(1);
    expect(output).toContain('packages/ui/src/button.css:1');
  });

  it('fails on a font shorthand that sets the family', () => {
    const { status, output } = run(
      `--root=${tree({ 'apps/web/app/x.css': '.b { font: 16px Inter; }\n' })}`,
    );
    expect(status).toBe(1);
    expect(output).toContain('apps/web/app/x.css:1');
  });

  it('allows colours and fonts in packages/ui/tokens.css', () => {
    const root = tree({
      'packages/ui/tokens.css':
        ':root {\n  --background: #EEEEEE;\n  --font-sans: Inter;\n}\nbody {\n  font-family: var(--font-sans);\n}\n',
    });
    expect(run(`--root=${root}`).status).toBe(0);
  });

  it('ignores id selectors, comments, url(#…) and font: inherit', () => {
    const root = tree({
      'apps/web/app/x.css':
        '/* color: #fff */\n#add {\n  mask: url(#fade);\n  font: inherit;\n  color: var(--foreground);\n}\n',
    });
    expect(run(`--root=${root}`).status).toBe(0);
  });

  it('skips node_modules and build output', () => {
    const root = tree({
      'node_modules/pkg/x.css': 'a { color: #fff; }\n',
      'apps/web/.next/static/x.css': 'a { color: #fff; }\n',
    });
    expect(run(`--root=${root}`).status).toBe(0);
  });

  it('passes on the real tree', () => {
    expect(run().status).toBe(0);
  });
});
