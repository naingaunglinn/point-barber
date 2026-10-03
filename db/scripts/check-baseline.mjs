// CI job `db` — checks the migrated database against the spec (design D4 · requirements
// "Database baseline equals the locked design" and "The API's database role cannot change or
// delete audit rows"). Connections: MIGRATE_DATABASE_URL (owner) and DATABASE_URL (point_app).
import { psql, scalar } from './lib/pg.mjs';

const owner = process.env.MIGRATE_DATABASE_URL;
const app = process.env.DATABASE_URL;
if (!owner || !app) {
  console.error('check-baseline: MIGRATE_DATABASE_URL and DATABASE_URL are required');
  process.exit(1);
}
delete process.env.PGTZ; // SHOW timezone must come from the database / role settings

const problems = [];
function expect(label, actual, wanted) {
  const ok = actual === wanted;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${actual}${ok ? '' : ` (expected ${wanted})`}`);
  if (!ok) problems.push(label);
}

expect(
  'tables in public (without _prisma_migrations)',
  scalar(
    owner,
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'",
  ),
  '91',
);
expect(
  'extension btree_gist',
  scalar(owner, "SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'"),
  '1',
);
expect('SHOW timezone (owner connection)', scalar(owner, 'SHOW timezone'), 'Asia/Yangon');
expect('SHOW timezone (point_app connection)', scalar(app, 'SHOW timezone'), 'Asia/Yangon');
expect(
  "to_char(timestamptz '2026-10-04T17:30:00Z')",
  scalar(owner, "SELECT to_char(timestamptz '2026-10-04T17:30:00Z', 'YYYY-MM-DD HH24:MI TZH:TZM')"),
  '2026-10-05 00:00 +06:30',
);
expect(
  'point_app rolsuper, rolcreatedb',
  scalar(owner, "SELECT rolsuper || ',' || rolcreatedb FROM pg_roles WHERE rolname = 'point_app'"),
  'false,false',
);
expect(
  'tables owned by point_app',
  scalar(
    owner,
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'point_app'",
  ),
  '0',
);
expect(
  'audit_events privileges INSERT, SELECT, UPDATE, DELETE',
  scalar(
    owner,
    "SELECT concat_ws(',', has_table_privilege('point_app', 'audit_events', 'INSERT')::text, has_table_privilege('point_app', 'audit_events', 'SELECT')::text, has_table_privilege('point_app', 'audit_events', 'UPDATE')::text, has_table_privilege('point_app', 'audit_events', 'DELETE')::text)",
  ),
  'true,true,false,false',
);
for (const sql of [
  "UPDATE audit_events SET reason = 'x'",
  'DELETE FROM audit_events',
  'TRUNCATE audit_events',
]) {
  const r = psql(app, ['-v', 'VERBOSITY=verbose', '-c', sql]);
  const refused =
    r.status !== 0 &&
    r.stderr.includes('42501') &&
    r.stderr.includes('permission denied for table audit_events');
  expect(
    `point_app: ${sql}`,
    refused ? 'refused 42501' : `status ${r.status} ${r.stderr.trim()}`,
    'refused 42501',
  );
}
expect(
  'point_app privileges on _prisma_migrations',
  scalar(
    owner,
    "SELECT concat_ws(',', has_table_privilege('point_app', '_prisma_migrations', 'SELECT')::text, has_table_privilege('point_app', '_prisma_migrations', 'INSERT')::text, has_table_privilege('point_app', '_prisma_migrations', 'UPDATE')::text, has_table_privilege('point_app', '_prisma_migrations', 'DELETE')::text)",
  ),
  'false,false,false,false',
);

console.log(
  problems.length === 0
    ? 'check-baseline: all checks passed'
    : `check-baseline: ${problems.length} check(s) failed`,
);
process.exit(problems.length === 0 ? 0 : 1);
