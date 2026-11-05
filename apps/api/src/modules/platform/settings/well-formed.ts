import { SETTINGS, valueSchema } from '@point/shared';
import type { Logger } from 'pino';
import type { z } from 'zod';

import type { StoredSetting } from './resolve.js';

// A stored value is checked with its key's value schema before it is resolved (P1-RULE-08 · design D2
// / D4). The API writes only values that passed the schema, but a row can be written by SQL — the
// restore runbook writes `system.maintenance` while the API is stopped (P8.BAK.03). A row the schema
// refuses is ignored, as a row of an unknown key is: the value falls back to the parent (the company
// value, then the default of settings.json), and the refusal is logged at `error` with the key and the
// issue's path and code — never the value.

const SCHEMAS: ReadonlyMap<string, z.ZodType> = new Map(
  SETTINGS.map((entry) => [entry.key, valueSchema(entry)]),
);

/** `rows` without the rows whose value fails their key's schema; each refusal logged once. */
export function wellFormedRows(rows: readonly StoredSetting[], log: Logger): StoredSetting[] {
  return rows.filter((row) => {
    const result = SCHEMAS.get(row.key)?.safeParse(row.value);
    if (result === undefined || result.success) return true;
    log.error(
      {
        key: row.key,
        issues: result.error.issues.map(({ path, code }) => ({ path: path.map(String), code })),
      },
      'settings row with a value its key does not accept — ignored, the parent value applies',
    );
    return false;
  });
}
