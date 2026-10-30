import { LocationType, PriceSource } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { type PriceRow, resolvePrice } from './resolve-price.js';

// add-walkin-visit-checkout task 4.1 — the resolution order of P2-RULE-03 (D-SVC-03 · D-SVC-05 ·
// D-SVC-06 · D-SVC-08) on the fixture prices of B3 (spec-fixtures §3): Haircut 8,000 from
// 01/Sep/2026, Ko Aung's own 10,000, and a scheduled 9,000 from 06/Oct/2026.
const KO_AUNG = 'e004';
const KO_MIN = 'e005';

const row = (over: Partial<PriceRow>): PriceRow => ({
  id: 'p',
  service_variant_id: null,
  location_type: LocationType.BRANCH,
  employee_id: null,
  price_amount: 8000n,
  duration_minutes: null,
  effective_from: '2026-09-01',
  effective_to: null,
  ...over,
});

const branch = row({ id: 'branch', effective_to: '2026-10-05' });
const scheduled = row({ id: 'scheduled', price_amount: 9000n, effective_from: '2026-10-06' });
const own = row({ id: 'own', employee_id: KO_AUNG, price_amount: 10000n });
const rows = [branch, scheduled, own];

const at = (date: string, over: { location?: number; employeeId?: string | null } = {}) =>
  resolvePrice(rows, {
    date,
    location: over.location ?? LocationType.BRANCH,
    employeeId: over.employeeId ?? null,
    variantId: null,
  });

describe('resolvePrice (P2-RULE-03)', () => {
  it('Ko Min: the branch row, 8,000, price_source 1', () => {
    expect(at('2026-10-05', { employeeId: KO_MIN })).toStrictEqual({
      row: branch,
      source: PriceSource.BRANCH,
    });
  });

  it('Ko Aung: his own row wins, 10,000, price_source 2', () => {
    expect(at('2026-10-05', { employeeId: KO_AUNG })).toStrictEqual({
      row: own,
      source: PriceSource.BARBER_OVERRIDE,
    });
  });

  it('no barber given: the branch row', () => {
    expect(at('2026-10-05')?.row.id).toBe('branch');
  });

  it('a scheduled price: 8,000 on 05/Oct, 9,000 from 06/Oct (both ends inclusive)', () => {
    expect(at('2026-10-05')?.row.price_amount).toBe(8000n);
    expect(at('2026-10-06')?.row.price_amount).toBe(9000n);
    expect(at('2026-09-01')?.row.price_amount).toBe(8000n);
  });

  it('before the first row: not sold (null)', () => {
    expect(at('2026-08-31')).toBeNull();
  });

  it('HOME without a home row: the branch-level row, never the barber row — price_source 4', () => {
    expect(at('2026-10-05', { location: LocationType.HOME, employeeId: KO_AUNG })).toStrictEqual({
      row: branch,
      source: PriceSource.HOME_FALLBACK_BRANCH,
    });
  });

  it('HOME with a home row: that row — price_source 3', () => {
    const home = row({ id: 'home', location_type: LocationType.HOME, price_amount: 12000n });
    expect(
      resolvePrice([...rows, home], {
        date: '2026-10-05',
        location: LocationType.HOME,
        employeeId: KO_AUNG,
        variantId: null,
      }),
    ).toStrictEqual({ row: home, source: PriceSource.HOME });
  });

  it('a variant prices only from its own rows', () => {
    const short = row({ id: 'short', service_variant_id: 'v-short', price_amount: 15000n });
    const long = row({ id: 'long', service_variant_id: 'v-long', price_amount: 25000n });
    const quote = (variantId: string) =>
      resolvePrice([short, long], {
        date: '2026-10-05',
        location: LocationType.BRANCH,
        employeeId: null,
        variantId,
      });
    expect(quote('v-long')?.row.id).toBe('long');
    expect(quote('v-none')).toBeNull();
  });

  it('no rows at all: null (not sold here)', () => {
    expect(
      resolvePrice([], {
        date: '2026-10-05',
        location: LocationType.BRANCH,
        employeeId: KO_MIN,
        variantId: null,
      }),
    ).toBeNull();
  });
});
