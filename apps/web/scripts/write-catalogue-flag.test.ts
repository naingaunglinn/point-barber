import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

// ui-foundation "The catalogue `/dev/ui` exists only outside the production image" (AD-IMPL-06 ·
// design D12 · PR #13 item 1): the flag becomes a constant at build time, `true` only for `1`.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'write-catalogue-flag.mjs');
const dir = mkdtempSync(join(tmpdir(), 'catalogue-flag-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Runs the script with the flag set to `value` (or absent) and returns the constant it wrote. */
function written(value: string | undefined): string {
  const out = join(dir, `flag-${value ?? 'unset'}.ts`);
  // The flag alone (NODE_ENV is required by Next.js's ProcessEnv type; the script ignores it).
  const flag = value === undefined ? {} : { NEXT_PUBLIC_DEV_CATALOGUE: value };
  const env = { NODE_ENV: 'test' as const, ...flag };
  const result = spawnSync(process.execPath, [SCRIPT, `--out=${out}`], { env });
  expect(result.status).toBe(0);
  return readFileSync(out, 'utf8');
}

describe('write-catalogue-flag', () => {
  it('writes true only when the flag is 1 (the dev and build:catalogue scripts)', () => {
    expect(written('1')).toContain('export const DEV_CATALOGUE: boolean = true;');
  });

  it('writes false without the flag (build, generate) and for any other value', () => {
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      expect(written(value), String(value)).toContain(
        'export const DEV_CATALOGUE: boolean = false;',
      );
    }
  });
});
