import { z } from 'zod';

// One entry of definitions/settings.json (D-PLT-16 · P1-RULE-08 · add-settings-store design D2):
// `{ key, module, type, default, scope, client_readable, read_only?, validation, label_key, help_key,
// impact_key }`. The key pattern is the DB CHECK `settings_key_chk`; the column is varchar(100).

/** The DB CHECK `settings_key_chk` and the OpenAPI path parameter `SettingKey`. */
export const SETTING_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/**
 * The types this change gives a value schema (design D2). Part 1 also names `time`, `uuid` and
 * `ref:<table>`; the change that adds the first key of such a type adds it here with its schema.
 */
export const settingTypeSchema = z.enum(['number', 'boolean', 'choice', 'text_mm_en', 'json']);

export const settingScopeSchema = z.enum(['company', 'branch']);

/** `validation.unit` (design D2). */
export const settingUnitSchema = z.enum(['MMK', 'minutes', 'days', 'MB', 'mm']);

export const settingValidationSchema = z.strictObject({
  unit: settingUnitSchema.optional(),
  min: z.int().optional(),
  max: z.int().optional(),
  choices: z.array(z.int()).min(1).optional(),
  max_length: z.int().min(1).optional(),
  nullable: z.boolean().optional(),
});

export const settingEntrySchema = z
  .strictObject({
    key: z.string().max(100).regex(SETTING_KEY_PATTERN),
    module: z.string().min(1).max(100),
    type: settingTypeSchema,
    default: z.unknown(),
    scope: settingScopeSchema,
    client_readable: z.boolean(),
    /** Refused by P1.SET.03 / 04 with 400 `setting_scope`; reported through `editable: false`. */
    read_only: z.literal(true).optional(),
    validation: settingValidationSchema,
    label_key: z.string(),
    help_key: z.string().nullable(),
    impact_key: z.string().nullable(),
  })
  .refine((entry) => entry.label_key === `settings.${entry.key}.label`, {
    message: 'label_key = settings.<key>.label',
  })
  .refine((entry) => entry.help_key === null || entry.help_key === `settings.${entry.key}.help`, {
    message: 'help_key = settings.<key>.help or null',
  })
  .refine(
    (entry) => entry.impact_key === null || entry.impact_key === `settings.${entry.key}.impact`,
    { message: 'impact_key = settings.<key>.impact or null' },
  )
  .refine((entry) => (entry.type === 'choice') === (entry.validation.choices !== undefined), {
    message: 'choices belong to a choice and every choice has them',
  });

export type SettingType = z.infer<typeof settingTypeSchema>;
export type SettingScope = z.infer<typeof settingScopeSchema>;
export type SettingUnit = z.infer<typeof settingUnitSchema>;
export type SettingValidation = z.infer<typeof settingValidationSchema>;
export type SettingEntry = z.infer<typeof settingEntrySchema>;
