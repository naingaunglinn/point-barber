// Limits fixed in code, each with its source (CG-ARCH-09). Values the owner may change are settings.

/** JSON request body limit — uploads get their own multipart route (design D5 · API-SHAPE-05). */
export const JSON_BODY_LIMIT = '1mb';

/** Health ping timeout: a hanging database answers `degraded` after this (design D9). */
export const HEALTH_PING_TIMEOUT_MS = 2_000;

/**
 * Interactive transaction waits (CG-DB-03): Prisma's defaults (2 s / 5 s) are too short for a
 * transaction that waits for a lock. Chosen in add-repo-scaffold; a change that needs longer (the
 * day close) raises them here with its source.
 */
export const TX_MAX_WAIT_MS = 10_000;
export const TX_TIMEOUT_MS = 30_000;

/**
 * The one safety ceiling of a read whose size no source caps (add-ci-lint-api design D3, kind C ·
 * CG-PERF-02): such a read asks for `take: READ_ROW_CEILING + 1` and passes its rows to
 * assertWithinCeiling, so a set over the ceiling fails loudly (500, Sentry) and is never cut silently.
 * Created here by add-schedule-patterns (A2b) with the names and semantics of add-ci-lint-api (#46);
 * whichever merges second imports it.
 */
export const READ_ROW_CEILING = 1_000;

/** The rows of a ceiling read; throws a plain Error naming the read when they pass the ceiling. */
export function assertWithinCeiling<T>(rows: T[], read: string): T[] {
  if (rows.length > READ_ROW_CEILING) {
    throw new Error(`${read}: more than ${READ_ROW_CEILING} rows (READ_ROW_CEILING)`);
  }
  return rows;
}
