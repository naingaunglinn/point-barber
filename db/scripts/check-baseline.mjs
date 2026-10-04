// CI job `db` — checks the migrated database against the spec of add-repo-scaffold, capability
// platform-runtime: requirement "Database baseline equals the locked design" (scenarios Table
// count · Extension · Time zone) and requirement "The API's database role cannot change or delete
// audit rows" (scenarios Update is refused · Delete and truncate are refused · Insert and select are
// allowed · Role attributes), plus task 3.9's checks on _prisma_migrations.
// Connections: MIGRATE_DATABASE_URL (owner) and DATABASE_URL (point_app). Every write probe runs in
// a transaction that is rolled back, so a broken grant can never change data.
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
const priv = (table, list) => `has_table_privilege('point_app', '${table}', '${list}')::text`;

expect(
  'Scenario: Table count',
  scalar(
    owner,
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'",
  ),
  '91',
);
expect(
  'Scenario: Extension',
  scalar(owner, "SELECT count(*) FROM pg_extension WHERE extname = 'btree_gist'"),
  '1',
);
expect(
  'Scenario: Time zone — SHOW timezone (owner connection)',
  scalar(owner, 'SHOW timezone'),
  'Asia/Yangon',
);
expect(
  'Scenario: Time zone — SHOW timezone (point_app connection)',
  scalar(app, 'SHOW timezone'),
  'Asia/Yangon',
);
expect(
  "Scenario: Time zone — to_char(timestamptz '2026-10-04T17:30:00Z')",
  scalar(owner, "SELECT to_char(timestamptz '2026-10-04T17:30:00Z', 'YYYY-MM-DD HH24:MI TZH:TZM')"),
  '2026-10-05 00:00 +06:30',
);
expect(
  'Scenario: Role attributes — rolsuper, rolcreatedb',
  scalar(owner, "SELECT rolsuper || ',' || rolcreatedb FROM pg_roles WHERE rolname = 'point_app'"),
  'false,false',
);
expect(
  'Scenario: Role attributes — tables owned by point_app',
  scalar(
    owner,
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'point_app'",
  ),
  '0',
);
expect(
  'Scenario: Insert and select are allowed — INSERT, SELECT, UPDATE, DELETE on audit_events',
  scalar(
    owner,
    `SELECT concat_ws(',', ${priv('audit_events', 'INSERT')}, ${priv('audit_events', 'SELECT')}, ${priv('audit_events', 'UPDATE')}, ${priv('audit_events', 'DELETE')})`,
  ),
  'true,true,false,false',
);
expect(
  'audit_events — none of UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER',
  scalar(owner, `SELECT ${priv('audit_events', 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')}`),
  'false',
);
const probes = [
  ['Scenario: Update is refused', "UPDATE audit_events SET reason = 'x'"],
  ['Scenario: Delete and truncate are refused — DELETE', 'DELETE FROM audit_events'],
  ['Scenario: Delete and truncate are refused — TRUNCATE', 'TRUNCATE audit_events'],
];
for (const [label, sql] of probes) {
  // ON_ERROR_STOP ends the session at the refused statement; a permitted one is rolled back.
  const r = psql(app, ['-v', 'VERBOSITY=verbose', '-c', 'BEGIN', '-c', sql, '-c', 'ROLLBACK']);
  const refused =
    r.status !== 0 &&
    r.stderr.includes('42501') &&
    r.stderr.includes('permission denied for table audit_events');
  expect(
    label,
    refused ? 'refused 42501' : `status ${r.status} ${r.stderr.trim()}`,
    'refused 42501',
  );
}
expect(
  '_prisma_migrations — no privilege for point_app (task 3.9)',
  scalar(
    owner,
    `SELECT ${priv('_prisma_migrations', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')}`,
  ),
  'false',
);

console.log(
  problems.length === 0
    ? 'check-baseline: all checks passed'
    : `check-baseline: ${problems.length} check(s) failed`,
);
process.exit(problems.length === 0 ? 0 : 1);
