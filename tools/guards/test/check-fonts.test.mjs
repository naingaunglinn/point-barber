import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-fonts.mjs');
const roots = [];

/** A temporary repository tree with the given files under packages/ui/fonts/ (or `folder`). */
function fonts(...names) {
  return fontsIn('packages/ui/fonts', ...names);
}

function fontsIn(folder, ...names) {
  const root = mkdtempSync(join(tmpdir(), 'check-fonts-'));
  roots.push(root);
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  for (const name of names) writeFileSync(join(dir, name), 'x');
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [guard, `--root=${root}`], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// add-shared-ui-components · ui-foundation "Fonts are self-hosted WOFF2 files with their licences"
// (AD-VIS-05 · design D3).
describe('check-fonts (pnpm fonts:check)', () => {
  it('passes when every family with a WOFF2 file has its licence file', () => {
    const root = fonts(
      'manrope-latin.woff2',
      'OFL-Manrope.txt',
      'archivo-black-latin.woff2',
      'OFL-ArchivoBlack.txt',
      'roboto-latin.woff2',
      'LICENSE-Roboto.txt',
      'pyidaungsu-regular.woff2',
      'pyidaungsu-bold.woff2',
      'LICENSE-Pyidaungsu.txt',
    );
    const { status, output } = run(root);
    expect(status).toBe(0);
    expect(output).toContain('check-fonts: ok — 4 families');
  });

  it('Scenario: A font family without its licence file fails CI', () => {
    const root = fonts('pyidaungsu-regular.woff2', 'pyidaungsu-bold.woff2', 'OFL-Manrope.txt');
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('Pyidaungsu');
    expect(output).toContain('pyidaungsu-regular.woff2');
    expect(output).toContain('AD-VIS-05');
  });

  it('names each family that misses its licence, once', () => {
    const root = fonts('inter-latin.woff2', 'archivo-black-latin.woff2', 'OFL-Inter.txt');
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('ArchivoBlack');
    expect(output).not.toContain('Inter has no');
    expect(output.match(/ArchivoBlack has no/g)).toHaveLength(1);
  });

  // add-walkin-visit-checkout task 9.1 — the document fonts ship with their licences (ADR-013 decision 2).
  it('checks packages/documents/fonts too, each folder on its own', () => {
    const missing = fontsIn(
      'packages/documents/fonts',
      'inter-latin.woff2',
      'pyidaungsu-bold.woff2',
      'LICENSE-Pyidaungsu.txt',
    );
    const { status, output } = run(missing);
    expect(status).toBe(1);
    expect(output).toContain(
      'Inter has no OFL-Inter.txt or LICENSE-Inter.txt in packages/documents/fonts',
    );
    const licensed = fontsIn('packages/documents/fonts', 'inter-latin.woff2', 'OFL-Inter.txt');
    expect(run(licensed).output).toContain('check-fonts: ok — 1 families');
  });

  it('passes on a folder without fonts', () => {
    expect(run(fonts()).status).toBe(0);
  });
});
