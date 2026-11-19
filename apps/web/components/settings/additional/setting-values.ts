import { type Locale } from '@point/i18n';
import {
  type Mmk,
  type MoneyProfile,
  type SettingKey,
  formatMoney,
  moneyFromWire,
  moneyToWire,
  settingEntry,
  valueSchema,
} from '@point/shared';
import { z } from 'zod';

// The values of Additional settings as the screen shows and edits them (AD-SET-01 · AD-FMT-01 ·
// D-PLT-16 · add-settings-store design D2 / D10 · tasks 5.4 – 5.6): one control per type — money for an
// MMK number, a number with its unit, a switch, a choice, the Myanmar / English pair — and the same value
// schema as the API, so a value the API would refuse is not sent. Pure functions: the components bind
// them to the language files and the form.

/** A translation function for the keys settings.json names (`settings.<key>.label`, choices, units). */
export type Translate = (key: string, values?: Readonly<Record<string, string | number>>) => string;

export interface FormatContext {
  readonly t: Translate;
  readonly locale: Locale;
  readonly profile: MoneyProfile;
}

/** The control of a key: by its type and unit (settings.json). `json` has no control here. */
export type ControlKind = 'money' | 'number' | 'switch' | 'choice' | 'text' | 'none';

export function controlOf(key: SettingKey): ControlKind {
  const entry = settingEntry(key);
  switch (entry.type) {
    case 'number':
      return 'unit' in entry.validation && entry.validation.unit === 'MMK' ? 'money' : 'number';
    case 'boolean':
      return 'switch';
    case 'choice':
      return 'choice';
    case 'text_mm_en':
      return 'text';
    case 'json':
      return 'none';
  }
}

/** The unit label key of a number key, if it has one (`settings.unit.days`). */
export function unitKeyOf(key: SettingKey): string | undefined {
  const { validation } = settingEntry(key);
  return 'unit' in validation ? `settings.unit.${validation.unit}` : undefined;
}

/** The choices of a choice key, in file order. */
export function choicesOf(key: SettingKey): readonly number[] {
  const { validation } = settingEntry(key);
  return 'choices' in validation ? validation.choices : [];
}

/** The value as text: `2,000 Ks`, `14 days`, `30 min`, `On`, the text in the UI language, or `—`. */
export function formatSettingValue(key: SettingKey, value: unknown, ctx: FormatContext): string {
  const { t, locale, profile } = ctx;
  if (value === null || value === undefined) return t('settings.value.none');
  const entry = settingEntry(key);
  switch (entry.type) {
    case 'number': {
      if (typeof value !== 'number') return String(value);
      if (controlOf(key) === 'money') return formatMoney(moneyFromWire(value), { locale, profile });
      const unit = unitKeyOf(key);
      return unit === undefined ? String(value) : `${String(value)} ${t(unit)}`;
    }
    case 'choice':
      return t(`settings.choice.${key}.${String(value)}`);
    case 'boolean':
      return t(value === true ? 'settings.value.on' : 'settings.value.off');
    case 'text_mm_en': {
      const text = value as { readonly mm: string; readonly en: string | null };
      return locale === 'en' ? (text.en ?? text.mm) : text.mm;
    }
    case 'json':
      return t(
        (value as { readonly enabled?: boolean }).enabled === true
          ? 'settings.value.on'
          : 'settings.value.off',
      );
  }
}

/** What a control holds while the user edits it. */
export type Draft =
  | { readonly kind: 'money'; readonly value: Mmk | null }
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'switch'; readonly value: boolean }
  | { readonly kind: 'choice'; readonly value: string | null }
  | { readonly kind: 'text'; readonly value: { readonly mm: string; readonly en: string | null } };

/** The form's value of a control: the draft member alone (`{ value }`). */
export type DraftValue = Draft['value'];

/** The draft of a stored value. */
export function draftOf(key: SettingKey, value: unknown): DraftValue {
  switch (controlOf(key)) {
    case 'money':
      return typeof value === 'number' ? moneyFromWire(value) : null;
    case 'number':
      return typeof value === 'number' ? String(value) : '';
    case 'switch':
      return value === true;
    case 'choice':
      return typeof value === 'number' ? String(value) : null;
    case 'text': {
      if (value === null || typeof value !== 'object') return { mm: '', en: null };
      const text = value as { readonly mm: string; readonly en: string | null };
      return { mm: text.mm, en: text.en };
    }
    case 'none':
      return null;
  }
}

/** A typed number → its number; empty → absent (a required value); anything else as typed. */
const WHOLE_OR_DECIMAL = /^-?\d+(\.\d+)?$/;
const numberText = z
  .string()
  .optional()
  .transform((text): unknown => {
    if (text === undefined) return undefined;
    const trimmed = text.trim();
    if (trimmed === '') return undefined;
    return WHOLE_OR_DECIMAL.test(trimmed) ? Number(trimmed) : text;
  });

/**
 * The form schema of one row, `{ value }`: the control's draft turned into the stored shape, then
 * `valueSchema(entry)` — the API's own schema. Its issues sit at `value`, `value.mm`, `value.en`, the
 * field names of the API's `errors[]` (API-ERR-03).
 */
export function rowSchemaOf(key: SettingKey) {
  const entry = settingEntry(key);
  const stored = valueSchema(entry);
  const input: z.ZodType<unknown> = (() => {
    switch (controlOf(key)) {
      case 'money':
        return z
          .custom<Mmk | null | undefined>(
            (v) => v === undefined || v === null || typeof v === 'bigint',
          )
          .transform((v) => (v === undefined || v === null ? undefined : moneyToWire(v)));
      case 'number':
        return numberText;
      case 'switch':
        return z.boolean();
      case 'choice':
        return z
          .string()
          .nullable()
          .transform((v) => (v === null ? undefined : Number(v)));
      case 'text':
        return z
          .object({ mm: z.string(), en: z.string().nullable() })
          .transform((pair) =>
            pair.mm.trim() === '' && (pair.en ?? '').trim() === '' ? null : pair,
          );
      case 'none':
        return z.unknown();
    }
  })() as z.ZodType<unknown>;
  return z.object({ value: input.pipe(stored) });
}
