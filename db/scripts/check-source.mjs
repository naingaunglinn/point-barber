// pnpm db:check-source — db/source/ equals its manifest; and, when the sibling repository
// ../point-sdd exists (the developers' workspace), equals point-sdd docs/db too (design D4.11).
// CI runs the manifest part only (`--manifest-only`): it does not check out point-sdd.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkManifest, checkSibling } from './lib/source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceDir = join(root, 'db', 'source');
const sibling = join(root, '..', 'point-sdd', 'docs', 'db');

const problems = checkManifest(sourceDir);
if (!process.argv.includes('--manifest-only')) {
  if (existsSync(sibling)) problems.push(...checkSibling(sourceDir, sibling));
  else console.log('check-source: ../point-sdd not found — manifest check only');
}
for (const p of problems) console.error(`check-source: ${p} (CG-DB-01 · D4.11)`);
if (problems.length === 0) console.log('check-source: db/source matches its manifest');
process.exit(problems.length === 0 ? 0 : 1);
