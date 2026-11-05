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

// ui-foundation "Lint and guards fail on a colour or font outside the token file" (AD-VIS-01 ·
// AD-IMPL-05 · D-UX-02 · design D14 / D16): colours and fonts in CSS live only in packages/ui/tokens.css
// (and its reference snapshot).
describe('check-css (CG-UI-05 · AD-IMPL-05 · design D16)', () => {
  it('Scenario: Colour in a CSS file — #EEEEEE outside tokens.css fails and names the file', () => {
    const root = tree({ 'apps/web/app/globals.css': 'body {\n  background: #EEEEEE;\n}\n' });
    const { status, output } = run(`--root=${root}`);
    expect(status).toBe(1);
    expect(output).toContain('apps/web/app/globals.css:2 — hex colour');
  });

  it.each(['rgb(238 238 238)', 'rgba(0, 0, 0, 0.5)', 'hsl(0 0% 93%)', 'oklch(0.5 0.1 30)'])(
    'fails on the colour function %s outside tokens.css',
    (value) => {
      const root = tree({ 'packages/ui/src/x.css': `.b {\n  color: ${value};\n}\n` });
      const { status, output } = run(`--root=${root}`);
      expect(status).toBe(1);
      expect(output).toContain('packages/ui/src/x.css:2 — colour function');
    },
  );

  it('Scenario: Font family outside the token file — font-family: Arial fails; inside tokens.css passes', () => {
    const failing = tree({ 'packages/ui/src/component.css': '.c {\n  font-family: Arial;\n}\n' });
    expect(run(`--root=${failing}`).status).toBe(1);
    const passing = tree({ 'packages/ui/tokens.css': ':root {\n  font-family: Arial;\n}\n' });
    expect(run(`--root=${passing}`).status).toBe(0);
  });

  it('allows colour functions in tokens.css and its reference snapshot', () => {
    const root = tree({
      'packages/ui/tokens.css': ':root {\n  --primary: oklch(0.205 0 0);\n}\n',
      'packages/ui/tokens.neutral.snapshot.css': ':root {\n  --primary: oklch(0.205 0 0);\n}\n',
    });
    expect(run(`--root=${root}`).status).toBe(0);
  });

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
