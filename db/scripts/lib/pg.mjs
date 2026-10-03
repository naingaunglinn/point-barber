// Small psql helpers for the database scripts. psql comes from PATH (or the PSQL variable).
import { spawnSync } from 'node:child_process';

export const PSQL = process.env.PSQL || 'psql';

/** The same connection URL with another database name. */
export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** Runs psql; returns { status, stdout, stderr }. */
export function psql(url, args, extraEnv = {}) {
  const result = spawnSync(PSQL, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', ...args, url], {
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
