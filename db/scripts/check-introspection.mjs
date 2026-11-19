// pnpm db:check-introspection — re-introspects the migrated database (`prisma db pull --print`)
// and fails when the result differs from the committed db/schema.prisma (design D4.5). --force:
// introspect from scratch, so a hand edit Prisma would otherwise keep (@map, @default, ///) fails too.
// db/schema.prisma is never edited by hand. Connection: MIGRATE_DATABASE_URL (owner role).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const normalise = (text) =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

if (!process.env.MIGRATE_DATABASE_URL) {
  console.error('check-introspection: MIGRATE_DATABASE_URL is required');
  process.exit(1);
}
const pulled = spawnSync(process.execPath, [prismaCli, 'db', 'pull', '--print', '--force'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (pulled.status !== 0) {
  console.error(`check-introspection: prisma db pull failed\n${pulled.stderr}`);
  process.exit(1);
}
const committed = normalise(readFileSync(join(root, 'db', 'schema.prisma'), 'utf8'));
const fresh = normalise(pulled.stdout);
if (committed === fresh) {
  console.log('check-introspection: db/schema.prisma matches the database');
  process.exit(0);
}
const a = committed.split('\n');
const b = fresh.split('\n');
const first = a.findIndex((line, i) => line !== b[i]);
console.error('check-introspection: db/schema.prisma differs from the migrated database (D4.5)');
console.error(`  first difference at line ${first + 1}:`);
console.error(`  committed: ${a[first] ?? '(end of file)'}`);
console.error(`  database : ${b[first] ?? '(end of file)'}`);
console.error('  Run `prisma db pull` on a freshly migrated database and commit the result.');
process.exit(1);
