// pnpm db:build-baseline — writes db/migrations/<timestamp>_baseline/migration.sql once
// (design D4.2): a time-zone preamble + the ten db/source files in README load order, each
// under a comment with its file name and SHA-256. The generated file is committed and never
// edited; a later database change is a new forward migration (D4.10).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkManifest, loadOrder, readManifest } from './lib/source.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceDir = join(root, 'db', 'source');
const migrationsDir = join(root, 'db', 'migrations');

const existing = readdirSync(migrationsDir).filter((name) => name.endsWith('_baseline'));
if (existing.length > 0) {
  console.error(
    `build-baseline: ${existing[0]} already exists — the baseline is never rebuilt (D4.10)`,
  );
  process.exit(1);
}
const problems = checkManifest(sourceDir);
if (problems.length > 0) {
  for (const p of problems) console.error(`build-baseline: ${p}`);
  process.exit(1);
}

const manifest = readManifest(sourceDir);
const files = loadOrder(manifest);
if (files.length !== 10) {
  console.error(
    `build-baseline: expected 10 baseline files (1 DDL + 9 constraints), found ${files.length}`,
  );
  process.exit(1);
}

const parts = [
  '-- Baseline: the locked database design of point-sdd docs/db (design D4.2).',
  `-- Built by db/scripts/build-baseline.mjs from point-sdd commit(s) ${[...new Set(files.map((f) => f.commit))].join(', ')}.`,
  '-- Never edit this file. A later change adds a new migration (docs/engineering/db-changes.md).',
  '',
  '-- Database time zone (D-PLT-15 · D4.7a)',
  "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Yangon'); END $$;",
  '',
];
for (const f of files) {
  const text = readFileSync(join(sourceDir, f.name), 'utf8').replace(/\r\n/g, '\n');
  parts.push(`-- ===== ${f.name} · sha256 ${f.sha256} =====`, text.trimEnd(), '');
}

const now = new Date();
const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
const dir = join(migrationsDir, `${stamp}_baseline`);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'migration.sql'), parts.join('\n'), 'utf8');
console.log(
  `build-baseline: wrote db/migrations/${stamp}_baseline/migration.sql (${files.length} files)`,
);
