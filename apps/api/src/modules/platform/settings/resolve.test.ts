import { settingEntry } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { describe, expect, it } from 'vitest';

import { type StoredSetting, resolveSetting, sameValue } from './resolve.js';

// add-settings-store task 2.4 — spec "The effective value is the branch override, else the company
// value, else the default" (P1-RULE-08 · P1.SET.04 · design D4): resolution in memory over the rows
// of one query, and `source` derived by equality with the parent value.
const { B1, B2, B3 } = FIXTURE_IDS.branches;
const KYAW_ZIN = FIXTURE_IDS.users.E001;
const MA_HNIN = FIXTURE_IDS.users.E002;
const FEE = settingEntry('home_service.transport_fee_amount');
const WINDOW = settingEntry('booking.advance_window_days');

const row = (
  key: string,
  branchId: string | null,
  value: unknown,
  by = KYAW_ZIN,
): StoredSetting => ({
  id: `0199a3f2-0000-7000-8fff-${(branchId ?? 'c').slice(-4).padStart(12, '0')}`,
  key,
  branch_id: branchId,
  value,
  updated_at: new Date('2026-10-05T02:40:00Z'),
  updated_by_user_id: by,
});

describe('add-settings-store · settings · The effective value is the branch override, else the company value, else the default', () => {
  it('Scenario: No rows — the default with source default', () => {
    expect(resolveSetting(FEE, [], B3)).toStrictEqual({
      company_value: null,
      branch_value: null,
      effective: 0,
      source: 'default',
      row: null,
    });
  });

  it('Scenario: A company value applies to every branch', () => {
    const company = row(FEE.key, null, 2000);
    for (const branchId of [B1, B2, B3]) {
      expect(resolveSetting(FEE, [company], branchId)).toStrictEqual({
        company_value: 2000,
        branch_value: null,
        effective: 2000,
        source: 'company',
        row: company,
      });
    }
    expect(resolveSetting(FEE, [company])).toStrictEqual({
      company_value: 2000,
      effective: 2000,
      source: 'company',
      row: company,
    });
  });

  it('Scenario: A branch override wins at its branch only', () => {
    const company = row(FEE.key, null, 2000);
    const b3 = row(FEE.key, B3, 3000, MA_HNIN);
    expect(resolveSetting(FEE, [company, b3], B3)).toMatchObject({
      company_value: 2000,
      branch_value: 3000,
      effective: 3000,
      source: 'branch',
      row: b3,
    });
    // The one query of design D4 returns only the rows of the asked branch; another branch's row is
    // never used even when it is passed.
    for (const branchId of [B1, B2]) {
      expect(resolveSetting(FEE, [company, b3], branchId)).toMatchObject({
        branch_value: null,
        effective: 2000,
        source: 'company',
        row: company,
      });
    }
    expect(resolveSetting(FEE, [company, b3])).toMatchObject({
      effective: 2000,
      source: 'company',
    });
  });

  it('Scenario: A company-only key asked for a branch — the company value', () => {
    const company = row(WINDOW.key, null, 7);
    // A branch row of a company-scope key cannot be written (400 setting_scope); were one there, it
    // would not count.
    const stray = row(WINDOW.key, B3, 30);
    expect(resolveSetting(WINDOW, [company, stray], B3)).toStrictEqual({
      company_value: 7,
      branch_value: null,
      effective: 7,
      source: 'company',
      row: company,
    });
  });

  it('Scenario: A row equal to its parent — the parent source', () => {
    const company = row(FEE.key, null, 2000);
    const b3 = row(FEE.key, B3, 2000, MA_HNIN);
    expect(resolveSetting(FEE, [company, b3], B3)).toStrictEqual({
      company_value: 2000,
      branch_value: 2000,
      effective: 2000,
      source: 'company',
      row: b3,
    });
    // A company row equal to the default reports `default`; a branch row equal to it then too.
    const slot = settingEntry('booking.slot_interval_minutes');
    expect(resolveSetting(slot, [row(slot.key, null, 15)])).toMatchObject({
      company_value: 15,
      source: 'default',
    });
    expect(resolveSetting(FEE, [row(FEE.key, B3, 0)], B3)).toMatchObject({
      branch_value: 0,
      effective: 0,
      source: 'default',
    });
  });

  it('a reset branch keeps its copy when the company changes (proposal reading 2)', () => {
    const company = row(FEE.key, null, 2500);
    const b3 = row(FEE.key, B3, 2000, MA_HNIN);
    expect(resolveSetting(FEE, [company, b3], B3)).toMatchObject({
      effective: 2000,
      source: 'branch',
    });
  });

  it('rows of other keys are ignored', () => {
    expect(resolveSetting(FEE, [row(WINDOW.key, null, 7)], B3)).toMatchObject({
      effective: 0,
      source: 'default',
    });
  });
});

describe('sameValue — the equality of parsed JSON values (design D4, member order ignored)', () => {
  it('compares objects member by member, in any order', () => {
    expect(sameValue({ mm: 'a', en: null }, { en: null, mm: 'a' })).toBe(true);
    expect(sameValue({ mm: 'a', en: null }, { mm: 'a', en: 'b' })).toBe(false);
    expect(sameValue({ mm: 'a' }, { mm: 'a', en: null })).toBe(false);
    expect(sameValue({ enabled: false }, { enabled: false })).toBe(true);
  });

  it('compares numbers, booleans, null and arrays by value', () => {
    expect(sameValue(2000, 2000)).toBe(true);
    expect(sameValue(2000, 2001)).toBe(false);
    expect(sameValue(false, null)).toBe(false);
    expect(sameValue(null, null)).toBe(true);
    expect(sameValue([1, 2], [1, 2])).toBe(true);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue([1], { 0: 1 })).toBe(false);
  });
});
