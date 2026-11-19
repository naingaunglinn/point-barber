import { describe, expect, it } from 'vitest';

import { loadMessages, type Locale } from '@point/i18n';
import { moneyFromWire } from '@point/shared';

import {
  type Translate,
  controlOf,
  draftOf,
  formatSettingValue,
  rowSchemaOf,
} from './setting-values';

// add-settings-store tasks 5.5 / 5.6 — the values of Additional settings (AD-SET-01 · AD-FMT-01 ·
// AD-FORM-03 · owner SS1 – SS3 · design D2): one control per type, the value as text in both
// languages, and the API's own value schema before a request is sent.

/** The language files as a translation of dotted keys (ICU `{name}` placeholders filled). */
function translator(locale: Locale): Translate {
  const messages = loadMessages(locale) as unknown as Record<string, unknown>;
  return (key, values = {}) => {
    const text = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], messages);
    if (typeof text !== 'string') throw new Error(`no text for ${key}`);
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
  };
}
const en = { t: translator('en'), locale: 'en' as const, profile: 'app' as const };
const my = { t: translator('my'), locale: 'my' as const, profile: 'app' as const };

const issuesOf = (key: Parameters<typeof rowSchemaOf>[0], value: unknown) => {
  const result = rowSchemaOf(key).safeParse({ value });
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path, code: i.code }));
};

describe('controls per type (task 5.5)', () => {
  it('money for an MMK number, a number with its unit, a switch, a choice and the text pair', () => {
    expect(controlOf('home_service.transport_fee_amount')).toBe('money');
    expect(controlOf('closing.cash_difference_tolerance_amount')).toBe('money');
    expect(controlOf('booking.advance_window_days')).toBe('number');
    expect(controlOf('system.upload_max_mb')).toBe('number');
    expect(controlOf('receipt.auto_print')).toBe('switch');
    expect(controlOf('booking.slot_interval_minutes')).toBe('choice');
    expect(controlOf('receipt.thank_you_text')).toBe('text');
    expect(controlOf('system.maintenance')).toBe('none');
  });

  it('Scenario: Money in both languages — 2,000 Ks and 2,000 ကျပ်', () => {
    expect(formatSettingValue('home_service.transport_fee_amount', 2000, en)).toBe('2,000 Ks');
    expect(formatSettingValue('home_service.transport_fee_amount', 2000, my)).toBe('2,000 ကျပ်');
  });

  it('numbers with their unit, choices and switches in the UI language', () => {
    expect(formatSettingValue('booking.advance_window_days', 14, en)).toBe('14 days');
    expect(formatSettingValue('booking.advance_window_days', 14, my)).toBe('14 ရက်');
    expect(formatSettingValue('home_service.travel_minutes', 30, en)).toBe('30 min');
    expect(formatSettingValue('booking.slot_interval_minutes', 15, en)).toBe('15 min');
    expect(formatSettingValue('receipt.printer_width_mm', 80, my)).toBe('80 mm');
    expect(formatSettingValue('system.default_language', 1, en)).toBe('Myanmar');
    expect(formatSettingValue('sales.tax_enabled', false, en)).toBe('Off');
    expect(formatSettingValue('receipt.auto_print', true, my)).toBe('ဖွင့်ထား');
    expect(formatSettingValue('system.maintenance', { enabled: false }, en)).toBe('Off');
  });

  it('the thank-you text in the UI language, the other as fallback, and — for none', () => {
    const text = { mm: 'ကျေးဇူးတင်ပါတယ်', en: 'Thank you!' };
    expect(formatSettingValue('receipt.thank_you_text', text, en)).toBe('Thank you!');
    expect(formatSettingValue('receipt.thank_you_text', text, my)).toBe('ကျေးဇူးတင်ပါတယ်');
    expect(formatSettingValue('receipt.thank_you_text', { mm: 'က', en: null }, en)).toBe('က');
    expect(formatSettingValue('receipt.thank_you_text', null, en)).toBe('—');
  });

  it('a draft of each stored value', () => {
    expect(draftOf('home_service.transport_fee_amount', 2000)).toBe(moneyFromWire(2000));
    expect(draftOf('booking.advance_window_days', 14)).toBe('14');
    expect(draftOf('receipt.auto_print', false)).toBe(false);
    expect(draftOf('booking.slot_interval_minutes', 15)).toBe('15');
    expect(draftOf('receipt.thank_you_text', null)).toStrictEqual({ mm: '', en: null });
  });
});

describe('the value schema before saving (task 5.6)', () => {
  it('Scenario: An invalid value is not sent — tolerance −1 is too_small at value', () => {
    expect(issuesOf('closing.cash_difference_tolerance_amount', moneyFromWire(-1))).toStrictEqual([
      { path: ['value'], code: 'too_small' },
    ]);
  });

  it('a number is a whole number within its limits; empty is missing', () => {
    expect(rowSchemaOf('system.upload_max_mb').parse({ value: '10' })).toStrictEqual({ value: 10 });
    expect(issuesOf('system.upload_max_mb', '11')).toStrictEqual([
      { path: ['value'], code: 'too_big' },
    ]);
    expect(issuesOf('home_service.travel_minutes', '30.5')).toStrictEqual([
      { path: ['value'], code: 'invalid_type' },
    ]);
    expect(issuesOf('home_service.travel_minutes', 'abc')).toStrictEqual([
      { path: ['value'], code: 'invalid_type' },
    ]);
    expect(issuesOf('booking.advance_window_days', '')).toStrictEqual([
      { path: ['value'], code: 'invalid_type' },
    ]);
  });

  it('money and choices become the stored numbers', () => {
    expect(
      rowSchemaOf('home_service.transport_fee_amount').parse({ value: moneyFromWire(2000) }),
    ).toStrictEqual({ value: 2000 });
    expect(rowSchemaOf('booking.slot_interval_minutes').parse({ value: '30' })).toStrictEqual({
      value: 30,
    });
  });

  it('the thank-you pair: both empty is null, Myanmar missing is too_small at value.mm', () => {
    expect(
      rowSchemaOf('receipt.thank_you_text').parse({ value: { mm: '', en: null } }),
    ).toStrictEqual({ value: null });
    expect(
      rowSchemaOf('receipt.thank_you_text').parse({ value: { mm: ' က ', en: '  ' } }),
    ).toStrictEqual({ value: { mm: 'က', en: null } });
    expect(issuesOf('receipt.thank_you_text', { mm: '', en: 'Thank you!' })).toStrictEqual([
      { path: ['value', 'mm'], code: 'too_small' },
    ]);
    expect(issuesOf('receipt.thank_you_text', { mm: 'က', en: 'e'.repeat(201) })).toStrictEqual([
      { path: ['value', 'en'], code: 'too_big' },
    ]);
  });
});
