// Small psql helpers for the database scripts. psql comes from PATH (or the PSQL variable).
// The password never goes on psql's command line — it would show in the process list and, when psql
// cannot start, in Node's error (CG-OBS-03 · CG-SEC-05): psql gets it through PGPASSWORD.
import { spawnSync } from 'node:child_process';

const psqlBinary = () => process.env.PSQL || 'psql';

// URL parameters Prisma understands and libpq rejects ("invalid URI query parameter").
const PRISMA_ONLY = [
  'schema',
  'connection_limit',
  'pool_timeout',
  'pgbouncer',
  'statement_cache_size',
  'socket_timeout',
  'sslaccept',
  'sslidentity',
  'sslpassword',
];

/**
 * The connection URL as psql receives it: without the Prisma-only parameters and without the
 * password, which goes through PGPASSWORD (passwordOf).
 */
export function forPsql(url) {
  const u = new URL(url);
  for (const name of PRISMA_ONLY) u.searchParams.delete(name);
  u.password = '';
  return u.toString();
}

/** The URL's password, percent-decoded, or undefined. */
export function passwordOf(url) {
  const { password } = new URL(url);
  return password === '' ? undefined : decodeURIComponent(password);
}

/** The same connection URL with another database name. */
export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** Runs psql; returns { status, stdout, stderr }. */
export function psql(url, args, extraEnv = {}) {
  const binary = psqlBinary();
  const password = passwordOf(url);
  const result = spawnSync(binary, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args, forPsql(url)], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PGCLIENTENCODING: 'UTF8',
      ...(password === undefined ? {} : { PGPASSWORD: password }),
      ...extraEnv,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    // Node's own error carries the whole command line; this one names only the binary and the fix.
    throw new Error(
      `could not start ${binary} (${result.error.code ?? result.error.message}) — install the PostgreSQL 16 client (psql on PATH) or set PSQL to its full path`,
    );
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** One value from a query (-At). Throws on error. */
export function scalar(url, sql) {
  const r = psql(url, ['-At', '-c', sql]);
  if (r.status !== 0) throw new Error(`psql failed: ${sql}\n${r.stderr}`);
  return r.stdout.trim();
}
