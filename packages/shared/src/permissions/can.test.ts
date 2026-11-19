import { describe, expect, it } from 'vitest';

import { createCan } from './can.js';
import type { MeGrants } from './grants.js';

// ui-foundation · "can() mirrors the grants of /me by data level" (AD-PERM-03 · AD-PERM-05 ·
// API-AUTH-05 · ADR-012 · design D7). The seven-code fixture catalogue: levels as in API Parts 1, 2,
// 3, 5 and 7.
const CATALOGUE = {
  'booking.create': { level: 'branch' },
  'booking.delete': { level: 'branch' },
  'closing.reopen': { level: 'branch' },
  'service.update': { level: 'mixed' },
  'role.update': { level: 'company' },
  'customer.update': { level: 'shared' },
  'payroll.view': { level: 'private' },
} as const;

const B1 = '0199a3f2-0000-7000-8000-0000000000b1';
const B3 = '0199a3f2-0000-7000-8000-0000000000b3';
const can = createCan(CATALOGUE);

function me(grants: MeGrants['grants'], showOwnEarnings = false): MeGrants {
  return { grants, effective: { show_own_earnings: showOwnEarnings }, branches_in_scope: [] };
}
const all = (scope: 1 | 2, branchIds: string[], codes: string[]) =>
  codes.map((code) => ({ code, scope_type: scope, branch_ids: branchIds }));

const admin = can(me(all(1, [], Object.keys(CATALOGUE)))); // U Kyaw Zin
const manager = can(
  // Ma Hnin
  me(all(2, [B3], ['booking.create', 'booking.delete', 'service.update', 'customer.update'])),
);
const barber = can(me([])); // Ko Aung
const branchHolder = can(me(all(2, [B3], ['role.update', 'payroll.view'])));

describe('can — level branch', () => {
  it('any grant passes without a branch; with a branch the grant must reach it', () => {
    expect(manager('booking.delete')).toBe(true);
    expect(manager('booking.delete', { branchId: B3 })).toBe(true);
    expect(admin('booking.delete', { branchId: B1 })).toBe(true);
  });

  it('Scenario: Manager outside her branch — Ma Hnin, booking.delete at B1 is false', () => {
    expect(manager('booking.delete', { branchId: B1 })).toBe(false);
  });

  it('a code the user does not hold is false', () => {
    expect(manager('closing.reopen')).toBe(false);
    expect(barber('booking.create')).toBe(false);
  });
});

describe('can — level company', () => {
  it('any grant opens the screen (read-only — API-PERM-03); acting needs company scope', () => {
    expect(branchHolder('role.update')).toBe(true);
    expect(branchHolder('role.update', { level: 'company' })).toBe(false);
    expect(admin('role.update', { level: 'company' })).toBe(true);
    expect(manager('role.update')).toBe(false);
  });
});

describe('can — level mixed', () => {
  it('as branch with a branch, as company with level company', () => {
    expect(manager('service.update')).toBe(true);
    expect(manager('service.update', { branchId: B3 })).toBe(true);
    expect(manager('service.update', { branchId: B1 })).toBe(false);
    expect(manager('service.update', { level: 'company' })).toBe(false);
    expect(admin('service.update', { level: 'company' })).toBe(true);
  });
});

describe('can — level shared', () => {
  it('any grant passes, whatever the options', () => {
    expect(manager('customer.update')).toBe(true);
    expect(manager('customer.update', { branchId: B1 })).toBe(true);
    expect(manager('customer.update', { level: 'company' })).toBe(true);
    expect(barber('customer.update')).toBe(false);
  });
});

describe('can — level private', () => {
  it('only a company-scope grant passes', () => {
    expect(branchHolder('payroll.view')).toBe(false);
    expect(branchHolder('payroll.view', { branchId: B3 })).toBe(false);
    expect(admin('payroll.view')).toBe(true);
    expect(admin('payroll.view', { branchId: B3 })).toBe(true);
  });
});

describe('can — earnings.view_own', () => {
  it('follows effective.show_own_earnings, not a grant', () => {
    expect(barber('earnings.view_own')).toBe(false);
    expect(can(me([], true))('earnings.view_own')).toBe(true);
  });
});

describe('can — types', () => {
  it('refuses an unknown code and the options a level does not allow', () => {
    // @ts-expect-error — not in the catalogue (D-ROLE-08: codes come only from the catalogue).
    manager('booking.cancel');
    // @ts-expect-error — a branch-level code has no company check.
    manager('booking.delete', { level: 'company' });
    // @ts-expect-error — a company-level code is not checked per branch.
    manager('role.update', { branchId: B3 });
    expect(true).toBe(true);
  });
});
