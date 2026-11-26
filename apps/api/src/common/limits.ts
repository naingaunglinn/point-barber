// Limits fixed in code, each with its source (CG-ARCH-09). Values the owner may change are settings.

/** JSON request body limit — uploads get their own multipart route (design D5 · API-SHAPE-05). */
export const JSON_BODY_LIMIT = '1mb';

/** A HEIC decode in its worker thread ends after this, so a hostile file cannot hold the queue (design R2 of add-attachments-upload). */
export const HEIC_DECODE_TIMEOUT_MS = 30_000;

/** Health ping timeout: a hanging database answers `degraded` after this (design D9). */
export const HEALTH_PING_TIMEOUT_MS = 2_000;

/**
 * Interactive transaction waits (CG-DB-03): Prisma's defaults (2 s / 5 s) are too short for a
 * transaction that waits for a lock. Chosen in add-repo-scaffold; a change that needs longer (the
 * day close) raises them here with its source.
 */
export const TX_MAX_WAIT_MS = 10_000;

/** Declared in packages/shared (the reorder schema bounds `ids` with it); the API imports it here. */
export { CANCEL_REASONS_MAX_ROWS } from '@point/shared';
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

/**
 * The most rows a list of an entity's files returns, newest first (CG-PERF-02 · CG-ARCH-09 · add-attachments-upload
 * task 3.1): an entity holds at most 20 live files by its callers' `max` and a user's staging rows are cut by
 * the 24-hour purge, so this is a guard, not a page.
 */
export const LIST_MAX = 100;

/**
 * What an upload request may carry besides its one file (design D3): the `purpose` and nothing else is
 * read, so a long value or many parts is refused before it is held in memory (CG-SEC-08).
 */
export const MULTIPART_LIMITS = { fieldSize: 1_024, fields: 10, parts: 20 } as const;
