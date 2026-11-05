import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import api from '../../eslint/api.mjs';
import web from '../../eslint/web.mjs';

// ui-foundation "Lint fails on locale formatting outside the formatter" (AD-FMT-00 · D-PLT-05),
// the clock and zone rules (D-PLT-15 · CG-TIME-03 / 04) and "Lint fails on a status compared with or
// set to a number" (AD-IMPL-04 · D-DB-03) — design D14 rows 7, 42, 43, 44.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser } },
    ...web,
    ...api,
  ],
});

async function rules(code, path) {
  const [result] = await eslint.lintText(code, { filePath: join(root, path) });
  return result.messages.map((m) => m.ruleId);
}

const DECLARE = 'declare const amount: bigint, date: Date, booking: { status: number };\n';
const COMPONENT = 'packages/ui/src/components/X/X.tsx';

describe('point/no-locale-format', () => {
  it.each([
    'export const a = amount.toLocaleString();',
    'export const f = new Intl.DateTimeFormat();',
  ])('Scenario: Formatting outside the formatter — %s fails in a component', async (code) => {
    expect(await rules(DECLARE + code, COMPONENT)).toEqual(['point/no-locale-format']);
    expect(await rules(DECLARE + code, 'apps/web/app/page.tsx')).toEqual([
      'point/no-locale-format',
    ]);
  });

  it.each([
    'export const a = date.toLocaleDateString();',
    'export const a = date.toLocaleTimeString();',
    'export const f = new Intl.NumberFormat();',
    'export const f = new Intl.RelativeTimeFormat();',
  ])('fails on %s', async (code) => {
    expect(await rules(DECLARE + code, 'packages/shared/src/visit/x.ts')).toEqual([
      'point/no-locale-format',
    ]);
  });

  it('passes the same calls inside packages/shared/src/format', async () => {
    const code = `${DECLARE}export const a = amount.toLocaleString();\nexport const f = new Intl.DateTimeFormat();\n`;
    expect(await rules(code, 'packages/shared/src/format/date.ts')).toEqual([]);
  });

  it('allows Intl.Segmenter and other Intl APIs', async () => {
    expect(await rules('export const s = new Intl.Segmenter();\n', COMPONENT)).toEqual([]);
  });
});

describe('point/no-device-clock', () => {
  it('Scenario: Device-zone getter — date.getHours() fails in a component', async () => {
    expect(await rules(`${DECLARE}export const h = date.getHours();\n`, COMPONENT)).toEqual([
      'point/no-device-clock',
    ]);
  });

  it.each(['export const d = new Date();', 'export const t = Date.now();', 'date.setDate(1);'])(
    '%s fails in apps/web and packages',
    async (code) => {
      for (const path of ['apps/web/app/x.ts', COMPONENT, 'packages/shared/src/visit/x.ts']) {
        expect(await rules(DECLARE + code, path)).toEqual(['point/no-device-clock']);
      }
    },
  );

  it('passes a parsed instant and the UTC getters', async () => {
    const code = `${DECLARE}export const d = new Date('2026-10-05T10:42:00+06:30');\nexport const h = date.getUTCHours();\n`;
    expect(await rules(code, COMPONENT)).toEqual([]);
  });

  it('ClockProvider may read the device clock, not the device zone', async () => {
    const path = 'packages/ui/src/providers/clock.tsx';
    expect(await rules(`${DECLARE}export const t = Date.now();\n`, path)).toEqual([]);
    expect(await rules(`${DECLARE}export const h = date.getHours();\n`, path)).toEqual([
      'point/no-device-clock',
    ]);
  });

  it('the time and format helpers may use local getters, not the device clock', async () => {
    for (const path of ['packages/shared/src/time/x.ts', 'packages/shared/src/format/x.ts']) {
      expect(await rules(`${DECLARE}export const h = date.getHours();\n`, path)).toEqual([]);
      expect(await rules(`${DECLARE}export const d = new Date();\n`, path)).toEqual([
        'point/no-device-clock',
      ]);
    }
  });
});

describe('point/no-raw-status', () => {
  it.each(['export const s = booking.status === 2;', 'export const b = { status: 2 };'])(
    'Scenario: Raw status number — %s fails',
    async (code) => {
      expect(await rules(DECLARE + code, COMPONENT)).toEqual(['point/no-raw-status']);
      expect(await rules(DECLARE + code, 'apps/web/app/x.tsx')).toEqual(['point/no-raw-status']);
    },
  );

  it.each([
    "export const s = booking['visit_status'] !== 0;",
    'booking.status = 3;',
    'export const s = 2 === booking.status;',
  ])('fails on %s', async (code) => {
    expect(await rules(DECLARE + code, COMPONENT)).toEqual(['point/no-raw-status']);
  });

  it('Scenario: Raw status number — booking.status === BookingStatus.STARTED passes', async () => {
    const code = `${DECLARE}declare const BookingStatus: { STARTED: 2 };\nexport const s = booking.status === BookingStatus.STARTED;\n`;
    expect(await rules(code, COMPONENT)).toEqual([]);
  });
});
