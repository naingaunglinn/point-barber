// Small psql helpers for the database scripts. psql comes from PATH (or the PSQL variable).
import { spawnSync } from 'node:child_process';

export const PSQL = process.env.PSQL || 'psql';

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

/** The same connection URL without the Prisma-only parameters, as psql / libpq accepts it. */
export function forPsql(url) {
  const u = new URL(url);
  for (const name of PRISMA_ONLY) u.searchParams.delete(name);
  return u.toString();
}

/** The same connection URL with another database name. */
export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** Runs psql; returns { status, stdout, stderr }. */
export function psql(url, args, extraEnv = {}) {
  const result = spawnSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args, forPsql(url)], {
    encoding: 'utf8',
    env: { ...process.env, PGCLIENTENCODING: 'UTF8', ...extraEnv },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** One value from a query (-At). Throws on error. */
export function scalar(url, sql) {
  const r = psql(url, ['-At', '-c', sql]);
  if (r.status !== 0) throw new Error(`psql failed: ${sql}\n${r.stderr}`);
  return r.stdout.trim();
}
