import { describe, expect, it } from 'vitest';

import { BRANCHES, COMPANY } from './010-organization.mjs';
import { JOIN_DATE, PEOPLE } from './020-people.mjs';
import { ASSIGNMENTS, EFFECTIVE_FROM as BRANCH_FROM } from './030-access.mjs';
import { BARBER_PRICES, CATEGORY, SERVICES } from './040-services.mjs';

// add-foundation-auth-access tasks 3.7 and 3.8 — the fixture modules hold exactly the rows of
// docs/plan/spec-fixtures.md §1–§3 and design D16.
describe('fixture 010-organization (task 3.7)', () => {
  it('names the company and the three branches as fixtures §1', () => {
    expect(COMPANY).toStrictEqual({ name_en: 'Point Barbershop', name_mm: 'ပွိုင့် ဘာဘာရှော့' });
    expect(BRANCHES.map(({ code, name_en, name_mm }) => [code, name_en, name_mm])).toStrictEqual([
      ['B1', 'Point 1.0', 'ပွိုင့် ၁.၀'],
      ['B2', 'Point 2.0', 'ပွိုင့် ၂.၀'],
      ['B3', 'Point 3.0', 'ပွိုင့် ၃.၀'],
    ]);
    for (const { code } of BRANCHES) expect(code).toMatch(/^[A-Z0-9]{1,10}$/);
  });
});

describe('fixture 020-people (task 3.7)', () => {
  it('has the nine codes, e-mail addresses and statuses of fixtures §2', () => {
    expect(PEOPLE.map((p) => [p.code, p.email, p.user_status, p.employee_status])).toStrictEqual([
      ['E001', 'kyawzin@point.test', 1, 1],
      ['E002', 'hnin@point.test', 1, 1],
      ['E003', 'zaw@point.test', 1, 1],
      ['E004', 'aung@point.test', 1, 1],
      ['E005', 'min@point.test', 1, 1],
      ['E006', 'htet@point.test', 1, 1],
      ['E007', 'thura@point.test', 1, 1],
      ['E008', 'thida@point.test', 2, 1],
      ['E009', 'naing@point.test', 0, 0],
    ]);
    expect(PEOPLE.map((p) => p.name_en)).toStrictEqual([
      'U Kyaw Zin',
      'Ma Hnin',
      'Ko Zaw',
      'Ko Aung',
      'Ko Min',
      'Ko Htet',
      'Ko Thura',
      'Ma Thida',
      'Ko Naing',
    ]);
    expect(JOIN_DATE).toBe('2026-09-01');
    expect(new Set(PEOPLE.map((p) => p.user_id)).size).toBe(9);
    expect(new Set(PEOPLE.map((p) => p.employee_id)).size).toBe(9);
  });
});

describe('fixture 030-access (task 3.7)', () => {
  it('assigns branches and roles as design D16', () => {
    expect(
      ASSIGNMENTS.map((a) => [a.code, a.branches.join(','), a.role, a.scope, a.endedOn ?? null]),
    ).toStrictEqual([
      ['E001', 'B1,B2,B3', 'Admin', 1, null],
      ['E002', 'B3', 'Manager', 2, null],
      ['E003', 'B1', 'Manager', 2, null],
      ['E004', 'B3', 'Barber', 2, null],
      ['E005', 'B3', 'Barber', 2, null],
      ['E006', 'B1', 'Barber', 2, null],
      ['E007', 'B2', 'Barber', 2, null],
      ['E008', 'B3', null, null, null],
      ['E009', 'B3', 'Barber', 2, '2026-09-30'],
    ]);
    expect(BRANCH_FROM).toBe('2026-09-01');
  });
});

describe('fixture 040-services (task 3.8)', () => {
  it('has the category, the three services, their durations and prices of fixtures §3', () => {
    expect(CATEGORY).toMatchObject({ name_en: 'Services', name_mm: 'ဝန်ဆောင်မှု' });
    expect(SERVICES.map((s) => [s.name_en, s.name_mm, s.minutes, s.prices])).toStrictEqual([
      ['Haircut', 'ဆံပင်ညှပ်', 30, { B1: 6000, B2: 7000, B3: 8000 }],
      ['Shave', 'မုတ်ဆိတ်ရိတ်', 15, { B1: 3000, B2: 3000, B3: 3000 }],
      ['Hair wash', 'ခေါင်းလျှော်', 10, { B1: 2000, B2: 2000, B3: 2000 }],
    ]);
    expect(BARBER_PRICES).toStrictEqual([
      { employee: 'E004', service: 'HAIRCUT', branch: 'B3', amount: 10000 },
    ]);
  });

  it('prices are whole kyats', () => {
    for (const s of SERVICES) {
      for (const amount of Object.values(s.prices)) expect(Number.isSafeInteger(amount)).toBe(true);
    }
  });
});
