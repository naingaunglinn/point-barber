import { z } from 'zod';

import type { Instant } from '../time/instant.js';
import { toMmtIso } from '../time/mmt-iso.js';
import type { SettingType } from './entry.js';

// One value schema for the app and the API (D-PLT-16 · P1-RULE-08 · API-ERR-03 · add-settings-store
// design D2 / D9): a whole number within the entry's limits (owner SS3), one of the listed choices,
// a boolean, a Myanmar / English text (SS1 / SS2 · D-DB-04) or the maintenance value (P1.SYS.03 ·
// SS2). The API answers a failure with 400 `validation` at `value`, `value.mm`, `value.en`; the
// screens run the same schema before they send.

/** A `text_mm_en` value: the Myanmar text is required, the English one may be null (D-DB-04). */
export interface TextMmEn {
  readonly mm: string;
  readonly en: string | null;
}

/**
 * The value of `system.maintenance` (D-PLT-08): the default is `{ enabled: false }`; a value written
 * by P1.SYS.03 always has the four members.
 */
export interface MaintenanceSetting {
  readonly enabled: boolean;
  readonly until?: Instant | null;
  readonly message_mm?: string | null;
  readonly message_en?: string | null;
}

/** The maintenance messages: at most 200 characters after trimming (owner SS2 · P1.SYS.03). */
export const MAINTENANCE_MESSAGE_MAX = 200;

/** A trimmed text of at most `max` characters; absent, null or empty after trimming → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));

/**
 * The body of P1.SYS.03 and the value it stores: `enabled` required; `until` an ISO 8601 time with
 * an offset, written with +06:30 (API-DATA-03), or null; each message trimmed, ≤ 200, empty → null.
 * The parsed value always has the four members (absent → null).
 */
export const maintenanceBodySchema = z.object({
  enabled: z.boolean(),
  until: z.iso
    .datetime({ offset: true })
    .nullish()
    .transform((value) =>
      value === undefined || value === null ? null : toMmtIso(new Date(value)),
    ),
  message_mm: optionalText(MAINTENANCE_MESSAGE_MAX),
  message_en: optionalText(MAINTENANCE_MESSAGE_MAX),
});

export type MaintenanceBody = z.input<typeof maintenanceBodySchema>;
export type MaintenanceValue = z.output<typeof maintenanceBodySchema>;

/** A `text_mm_en` value: `mm` 1 – `maxLength` after trimming, `en` ≤ `maxLength`, empty → null. */
export function textMmEnSchema(maxLength: number) {
  return z.object({
    mm: z.string().trim().min(1).max(maxLength),
    en: optionalText(maxLength),
  });
}

/** What valueSchema reads of an entry — a settings.json entry or its typed copy. */
export interface ValueSchemaEntry {
  readonly key: string;
  readonly type: SettingType;
  readonly validation: {
    readonly min?: number;
    readonly max?: number;
    readonly choices?: readonly number[];
    readonly max_length?: number;
    readonly nullable?: boolean;
  };
}

/** The `json` keys and their schema; a `json` key without one is a programming error. */
const JSON_SCHEMAS: Readonly<Record<string, z.ZodType>> = {
  'system.maintenance': maintenanceBodySchema,
};

/** The Zod schema of a value of `entry` (design D2). */
export function valueSchema(entry: ValueSchemaEntry): z.ZodType {
  const { validation } = entry;
  switch (entry.type) {
    case 'number': {
      let schema = z.int();
      if (validation.min !== undefined) schema = schema.min(validation.min);
      if (validation.max !== undefined) schema = schema.max(validation.max);
      return schema;
    }
    case 'choice': {
      if (validation.choices === undefined || validation.choices.length === 0) {
        throw new Error(`the choice setting ${entry.key} lists no choices`);
      }
      return z.literal([...validation.choices]);
    }
    case 'boolean':
      return z.boolean();
    case 'text_mm_en': {
      if (validation.max_length === undefined) {
        throw new Error(`the text setting ${entry.key} has no max_length`);
      }
      const schema = textMmEnSchema(validation.max_length);
      return validation.nullable === true ? schema.nullable() : schema;
    }
    case 'json': {
      const schema = JSON_SCHEMAS[entry.key];
      if (schema === undefined)
        throw new Error(`no value schema for the json setting ${entry.key}`);
      return schema;
    }
  }
}
