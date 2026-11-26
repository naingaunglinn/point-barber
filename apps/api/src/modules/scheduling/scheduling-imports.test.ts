import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// add-schedule-patterns task 5.1 — the import boundary of the booking port (design D1 · ADR-001 rule 1):
// `scheduling` never imports `booking`, because `booking` will import `scheduling` (availability, the
// calendar's roster read). The port is declared in `scheduling` and implemented in `booking`.
const root = dirname(fileURLToPath(import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('add-schedule-patterns · scheduling · never imports booking (ADR-001 rule 1)', () => {
  it('no file of the module imports the booking module', () => {
    const offenders = sources(root).filter((file) =>
      /from\s+['"](?:\.\.\/)+booking(?:\/|['"])/.test(readFileSync(file, 'utf8')),
    );
    expect(offenders).toStrictEqual([]);
  });

  it('the check sees the module: it reads the port file', () => {
    expect(sources(root).some((file) => file.endsWith('booked-blocks.ts'))).toBe(true);
  });
});
