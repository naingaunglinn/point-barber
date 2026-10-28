import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-fonts.mjs');
const roots = [];

/** A temporary repository tree with the given files under packages/ui/fonts/. */
function fonts(...names) {
  const root = mkdtempSync(join(tmpdir(), 'check-fonts-'));
  roots.push(root);
  const dir = join(root, 'packages/ui/fonts');
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

  it('passes on a folder without fonts', () => {
    expect(run(fonts()).status).toBe(0);
  });
});
