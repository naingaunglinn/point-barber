import { z } from 'zod';

import { SETTING_KEY_PATTERN, settingScopeSchema } from '../settings/entry.js';
import { listQuerySchema } from './list-query.js';

// The settings DTOs of OpenAPI Part 1 (P1.SET.01 – 05 · API-ERR-03 · add-settings-store design D2 /
// D5): SettingDefinition, SettingView, SettingHistoryItem and the three responses, plus the request
// schemas of the read endpoints. A value is typed per settings.json, so it is `unknown` here.

const dateTime = z.iso.datetime({ offset: true });

/** `{ id, name_mm, name_en }` — the user behind a value or a history line (their employee names). */
export const settingUserSchema = z.strictObject({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
});

/** OpenAPI Part 1 `SettingDefinition` — `read_only` is internal and shows as `editable: false`. */
export const settingDefinitionSchema = z.strictObject({
  type: z.string(),
  scope: settingScopeSchema,
  module: z.string(),
  default: z.unknown(),
  label_key: z.string(),
  help_key: z.string().nullable(),
  impact_key: z.string().nullable(),
  validation: z.record(z.string(), z.unknown()),
  client_readable: z.boolean(),
});

export const settingSourceSchema = z.enum(['default', 'company', 'branch']);

/** OpenAPI Part 1 `SettingView` — `branch_value` only when a `branch_id` was asked for. */
export const settingViewSchema = z.strictObject({
  key: z.string(),
  definition: settingDefinitionSchema,
  company_value: z.unknown(),
  branch_value: z.unknown().optional(),
  effective: z.unknown(),
  source: settingSourceSchema,
  editable: z.boolean(),
  updated_at: dateTime.nullable(),
  updated_by: settingUserSchema.nullable(),
});

/** OpenAPI Part 1 `SettingHistoryItem`. */
export const settingHistoryItemSchema = z.strictObject({
  id: z.uuid(),
  branch_id: z.uuid().nullable(),
  old_value: z.unknown(),
  new_value: z.unknown(),
  changed_at: dateTime,
  changed_by: settingUserSchema,
});

/** P1.SET.01 — `{ items }`. */
export const settingListSchema = z.strictObject({ items: z.array(settingViewSchema) });

/** P1.SET.02 — `{ values, as_of }`. */
export const effectiveSettingsSchema = z.strictObject({
  values: z.record(z.string(), z.unknown()),
  as_of: dateTime,
});

/** P1.SET.05 — `{ items, next_cursor }`. */
export const settingHistoryPageSchema = z.strictObject({
  items: z.array(settingHistoryItemSchema),
  next_cursor: z.string().nullable(),
});

/** The path parameter `{key}` (OpenAPI `SettingKey`): a malformed key is 400 `validation` at `key`. */
export const settingKeyParamSchema = z.object({
  key: z.string().max(100).regex(SETTING_KEY_PATTERN),
});

/**
 * P1.SET.03 body `{ value, branch_id? }`: the value is typed per settings.json, so it is checked by
 * valueSchema(entry) after the key and the scope (design D5); no `branch_id` (or null) = the company
 * value. A request schema: unknown members are stripped (CG-API-03).
 */
export const settingPutBodySchema = z.object({
  value: z.unknown(),
  branch_id: z.uuid().nullable().optional(),
});

/** P1.SET.04 body `{ branch_id? }` — optional: no body resets the company value. */
export const settingResetBodySchema = z.object({ branch_id: z.uuid().nullable().optional() });

/** P1.SET.01 query: `module`, `branch_id`. */
export const settingListQuerySchema = z.object({
  module: z.string().trim().min(1).max(100).optional(),
  branch_id: z.uuid().optional(),
});

/** P1.SET.02 query: `branch_id`, `keys` (comma-separated; absent = the whole client-readable set). */
export const effectiveSettingsQuerySchema = z.object({
  branch_id: z.uuid().optional(),
  keys: z
    .string()
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((key) => key.trim())
          .filter((key) => key !== ''),
      ),
    ])
    .optional(),
});

/** P1.SET.05 query: `branch_id`, `cursor`, `limit` (1 – 100, default 25 — API-DATA-08). */
export const settingHistoryQuerySchema = listQuerySchema.extend({ branch_id: z.uuid().optional() });

export type SettingUser = z.infer<typeof settingUserSchema>;
export type SettingDefinition = z.infer<typeof settingDefinitionSchema>;
export type SettingSource = z.infer<typeof settingSourceSchema>;
export type SettingView = z.infer<typeof settingViewSchema>;
export type SettingHistoryItem = z.infer<typeof settingHistoryItemSchema>;
export type SettingList = z.infer<typeof settingListSchema>;
export type EffectiveSettings = z.infer<typeof effectiveSettingsSchema>;
export type SettingHistoryPage = z.infer<typeof settingHistoryPageSchema>;
export type SettingPutBody = z.infer<typeof settingPutBodySchema>;
export type SettingResetBody = z.infer<typeof settingResetBodySchema>;
export type SettingListQuery = z.infer<typeof settingListQuerySchema>;
export type EffectiveSettingsQuery = z.infer<typeof effectiveSettingsQuerySchema>;
export type SettingHistoryQuery = z.infer<typeof settingHistoryQuerySchema>;
