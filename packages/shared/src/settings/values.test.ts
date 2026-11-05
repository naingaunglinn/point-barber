import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { settingEntry } from './catalogue.js';
import { maintenanceBodySchema, valueSchema } from './values.js';

// add-settings-store tasks 1.4 – 1.6 — one value schema for the app and the API (design D2 · D9):
// the limits of owner SS3, the listed choices (D-BKG-07 · D-PAY-07 · D-PLT-03), the thank-you text
// of SS1 / SS2 (D-DB-04) and the maintenance body of P1.SYS.03 (SS2). A failure carries the Zod
// issue name the API returns unchanged (API-ERR-03).

type Issue = { readonly code: string; readonly path: readonly PropertyKey[] } & Record<
  string,
  unknown
>;

function issuesOf(schema: z.ZodType, value: unknown): Issue[] {
  const result = schema.safeParse(value);
  return result.success ? [] : (result.error.issues as unknown as Issue[]);
}

const schemaOf = (key: Parameters<typeof settingEntry>[0]) => valueSchema(settingEntry(key));

describe('add-settings-store · settings · Number settings are whole numbers within their limits', () => {
  it('Scenario: Zero transport fee — 0 passes, −1 is too_small with minimum 0', () => {
    const fee = schemaOf('home_service.transport_fee_amount');
    expect(fee.parse(0)).toBe(0);
    expect(issuesOf(fee, -1)).toMatchObject([{ code: 'too_small', minimum: 0, path: [] }]);
  });

  it('Scenario: Negative tolerance — −1 is too_small with minimum 0', () => {
    expect(issuesOf(schemaOf('closing.cash_difference_tolerance_amount'), -1)).toMatchObject([
      { code: 'too_small', minimum: 0 },
    ]);
  });

  it('Scenario: Not a whole number — travel minutes 30.5 and "30" are refused', () => {
    const travel = schemaOf('home_service.travel_minutes');
    expect(issuesOf(travel, 30.5)).toMatchObject([{ code: 'invalid_type' }]);
    expect(issuesOf(travel, '30')).toMatchObject([{ code: 'invalid_type' }]);
    expect(travel.parse(30)).toBe(30);
  });

  it('Scenario: Upload size at its limits — 1 and 10 pass, 0 too_small 1, 11 too_big 10', () => {
    const upload = schemaOf('system.upload_max_mb');
    expect(upload.parse(1)).toBe(1);
    expect(upload.parse(10)).toBe(10);
    expect(issuesOf(upload, 0)).toMatchObject([{ code: 'too_small', minimum: 1 }]);
    expect(issuesOf(upload, 11)).toMatchObject([{ code: 'too_big', maximum: 10 }]);
  });

  it('Scenario: Advance window of zero days — 0 passes', () => {
    expect(schemaOf('booking.advance_window_days').parse(0)).toBe(0);
  });

  it('the four open-ended number keys keep no maximum of their own (owner SS3 = C)', () => {
    for (const key of [
      'home_service.transport_fee_amount',
      'closing.cash_difference_tolerance_amount',
      'home_service.travel_minutes',
      'booking.advance_window_days',
    ] as const) {
      expect(schemaOf(key).parse(200_000_000), key).toBe(200_000_000);
    }
  });
});

describe('add-settings-store · settings · Choice and switch settings accept only their listed values', () => {
  it('Scenario: A listed interval — 30 passes', () => {
    expect(schemaOf('booking.slot_interval_minutes').parse(30)).toBe(30);
  });

  it('Scenario: An interval that is not listed — 20 is invalid_value', () => {
    expect(issuesOf(schemaOf('booking.slot_interval_minutes'), 20)).toMatchObject([
      { code: 'invalid_value' },
    ]);
  });

  it('Scenario: Printer width — 80 passes, 76 is invalid_value', () => {
    const width = schemaOf('receipt.printer_width_mm');
    expect(width.parse(80)).toBe(80);
    expect(issuesOf(width, 76)).toMatchObject([{ code: 'invalid_value' }]);
  });

  it('Scenario: Language code — 3 is invalid_value', () => {
    expect(issuesOf(schemaOf('system.default_language'), 3)).toMatchObject([
      { code: 'invalid_value' },
    ]);
  });

  it('Scenario: A switch is a boolean — "yes" is invalid_type', () => {
    const autoPrint = schemaOf('receipt.auto_print');
    expect(issuesOf(autoPrint, 'yes')).toMatchObject([{ code: 'invalid_type' }]);
    expect(autoPrint.parse(true)).toBe(true);
  });
});

describe('add-settings-store · settings · The receipt thank-you text', () => {
  const text = schemaOf('receipt.thank_you_text');

  it('null means no thank-you line and is accepted', () => {
    expect(text.parse(null)).toBeNull();
  });

  it('Scenario: Myanmar only prints no line — an English text of spaces is stored as null', () => {
    expect(text.parse({ mm: 'ကျေးဇူးတင်ပါတယ်', en: '  ' })).toStrictEqual({
      mm: 'ကျေးဇူးတင်ပါတယ်',
      en: null,
    });
    expect(text.parse({ mm: 'ကျေးဇူးတင်ပါတယ်' })).toStrictEqual({
      mm: 'ကျေးဇူးတင်ပါတယ်',
      en: null,
    });
  });

  it('Scenario: Text lengths — en 200 passes, en 201 too_big at en, mm empty too_small at mm', () => {
    expect(text.parse({ mm: 'မ', en: 'e'.repeat(200) })).toStrictEqual({
      mm: 'မ',
      en: 'e'.repeat(200),
    });
    expect(issuesOf(text, { mm: 'မ', en: 'e'.repeat(201) })).toMatchObject([
      { code: 'too_big', maximum: 200, path: ['en'] },
    ]);
    expect(issuesOf(text, { mm: '   ', en: 'Thank you!' })).toMatchObject([
      { code: 'too_small', minimum: 1, path: ['mm'] },
    ]);
  });

  it('the Myanmar text is trimmed and at most 200 characters', () => {
    expect(text.parse({ mm: '  ကျေးဇူး  ', en: ' Thank you! ' })).toStrictEqual({
      mm: 'ကျေးဇူး',
      en: 'Thank you!',
    });
    expect(issuesOf(text, { mm: 'မ'.repeat(201) })).toMatchObject([
      { code: 'too_big', maximum: 200, path: ['mm'] },
    ]);
  });

  it('reordered members give the same value', () => {
    expect(text.parse({ en: 'Thank you!', mm: 'က' })).toStrictEqual(
      text.parse({ mm: 'က', en: 'Thank you!' }),
    );
  });
});

describe('add-settings-store · settings · Maintenance mode is switched by a company-scope settings.update holder', () => {
  it('enabled is a required boolean', () => {
    expect(issuesOf(maintenanceBodySchema, {})).toMatchObject([
      { code: 'invalid_type', path: ['enabled'] },
    ]);
    expect(issuesOf(maintenanceBodySchema, { enabled: 'yes' })).toMatchObject([
      { code: 'invalid_type', path: ['enabled'] },
    ]);
  });

  it('Scenario: Turn maintenance on — the four members as sent', () => {
    expect(
      maintenanceBodySchema.parse({
        enabled: true,
        until: '2026-10-05T22:00:00+06:30',
        message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
        message_en: 'Server update',
      }),
    ).toStrictEqual({
      enabled: true,
      until: '2026-10-05T22:00:00+06:30',
      message_mm: 'ဆာဗာ ပြင်နေပါတယ်',
      message_en: 'Server update',
    });
  });

  it('Scenario: Turn it off — absent members are stored as null', () => {
    expect(maintenanceBodySchema.parse({ enabled: false })).toStrictEqual({
      enabled: false,
      until: null,
      message_mm: null,
      message_en: null,
    });
  });

  it('until is an ISO 8601 time with an offset, written with +06:30 (API-DATA-03)', () => {
    expect(
      issuesOf(maintenanceBodySchema, { enabled: true, until: '2026-10-05T22:00:00' }),
    ).toMatchObject([{ path: ['until'] }]);
    expect(
      maintenanceBodySchema.parse({ enabled: true, until: '2026-10-05T15:30:00Z' }).until,
    ).toBe('2026-10-05T22:00:00+06:30');
  });

  it('Scenario: A message that is too long — message_en of 201 is too_big 200; empty is null', () => {
    expect(
      issuesOf(maintenanceBodySchema, { enabled: true, message_en: 'e'.repeat(201) }),
    ).toMatchObject([{ code: 'too_big', maximum: 200, path: ['message_en'] }]);
    expect(
      maintenanceBodySchema.parse({ enabled: true, message_en: ` ${'e'.repeat(200)} ` }).message_en,
    ).toBe('e'.repeat(200));
    expect(maintenanceBodySchema.parse({ enabled: true, message_mm: '   ' }).message_mm).toBeNull();
  });

  it('the value schema of system.maintenance is the body schema', () => {
    expect(schemaOf('system.maintenance').parse({ enabled: false })).toStrictEqual({
      enabled: false,
      until: null,
      message_mm: null,
      message_en: null,
    });
  });
});
