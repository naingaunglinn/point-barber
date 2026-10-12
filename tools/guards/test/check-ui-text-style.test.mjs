import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-ui-text-style.mjs');
const roots = [];

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'check-ui-text-style-'));
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

const COMPONENT = 'packages/ui/src/components/X/X.tsx';

// Technical guarantee (design D14 · AD-VIS-06 · FE-VIS-01b): no text transform, italic or letter
// spacing in the shared components — Myanmar text has no case, and slanted or spaced Myanmar breaks its
// stacked marks; the site-only `--decoration` colour stays out of the components of both trees.
describe('tools/guards/check-ui-text-style.mjs (AD-VIS-06 · FE-VIS-01b)', () => {
  it.each([
    ['uppercase', `export const c = 'text-sm uppercase';\n`],
    ['italic', `export const c = 'md:italic font-semibold';\n`],
    ['tracking-*', `export const c = 'tracking-wide';\n`],
    ['tracking-*', 'export const c = `px-2 tracking-[0.2em]`;\n'],
    ['--decoration', `export const c = 'text-[var(--decoration)]';\n`],
    ['--decoration', `export const c = 'bg-decoration';\n`],
  ])('fails on %s in a component and names the file and line', (problem, code) => {
    const { status, output } = run(tree({ [COMPONENT]: `// x\n${code}` }));
    expect(status).toBe(1);
    expect(output).toContain(`${COMPONENT}:2`);
    expect(output).toContain(problem);
  });

  it.each([
    ['text-transform', '.a {\n  text-transform: uppercase;\n}\n'],
    ['font-style', '.a {\n  font-style: italic;\n}\n'],
    ['letter-spacing', '.a {\n  letter-spacing: 0.1em;\n}\n'],
  ])('fails on %s in a stylesheet of packages/ui/src', (problem, css) => {
    const { status, output } = run(tree({ 'packages/ui/src/x.css': css }));
    expect(status).toBe(1);
    expect(output).toContain('packages/ui/src/x.css:2');
    expect(output).toContain(problem);
  });

  it('passes ordinary classes, comments and identifiers that contain the words', () => {
    const code = [
      '// uppercase and italic are not used (AD-VIS-06)',
      "export const c = 'font-semibold text-sm';",
      'export const upper = (s: string) => s.toUpperCase();',
      "export const key = 'tokens.decorationNote';",
      "export const d = 'underline decoration-2';",
    ].join('\n');
    expect(run(tree({ [COMPONENT]: code })).status).toBe(0);
  });

  it('ignores files outside packages/ui/src and test files', () => {
    const root = tree({
      'apps/web/app/page.tsx': "export const c = 'uppercase';\n",
      'packages/ui/src/components/X/X.test.tsx': "expect(c).not.toContain('uppercase');\n",
    });
    expect(run(root).status).toBe(0);
  });

  it("lets the catalogue's token table name --decoration", () => {
    const root = tree({
      'packages/ui/src/catalogue/swatches.ts': "export const SITE_ONLY = ['--decoration'];\n",
      'packages/ui/src/catalogue/contrast.ts': "export const pair = ['--decoration', '--card'];\n",
    });
    expect(run(root).status).toBe(0);
  });

  it('passes on the real tree', () => {
    expect(run().status).toBe(0);
  });
});
