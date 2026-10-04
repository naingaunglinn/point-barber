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
