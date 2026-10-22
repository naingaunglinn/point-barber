import { PERMISSIONS } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { BARBER_SEED_CODES, MANAGER_PART4_SEED_CODES, MANAGER_SEED_CODES } from './seed-roles.js';

// add-walkin-visit-checkout task 1.4 — the Part 4 seed codes of Manager and Barber (Part 4 §9 ·
// D-ROLE-07 · D-ROLE-09). The Part 1 set is checked by base-seed.int.test.ts.
const known = new Set(PERMISSIONS.map((entry) => entry.code));

describe('seed roles — Part 4 codes', () => {
  it('Manager: the thirteen codes its Part 4 seed entry names, branch scope', () => {
    expect([...MANAGER_PART4_SEED_CODES].sort()).toStrictEqual(
      [
        'discount.approve',
        'discount.view',
        'payment.verify',
        'payment.view',
        'sale.create',
        'sale.delete',
        'sale.finish_override',
        'sale.late_entry',
        'sale.override_price',
        'sale.view',
        'visit.delete',
        'visit.update',
        'visit.view',
      ].sort(),
    );
  });

  it('Barber: late entry (D-VIS-13 default) and the product-only sale, nothing else', () => {
    expect([...BARBER_SEED_CODES].sort()).toStrictEqual(['sale.create', 'sale.late_entry']);
  });

  it('keeps refunds, adjustments, codes and methods with the Admin (owner B7 a · B12)', () => {
    const others = [...MANAGER_SEED_CODES, ...MANAGER_PART4_SEED_CODES, ...BARBER_SEED_CODES];
    for (const code of [
      'sale.refund',
      'sale.adjust',
      'discount.create',
      'discount.update',
      'discount.delete',
      'payment_method.view',
      'payment_method.create',
      'payment_method.update',
      'payment_method.delete',
    ])
      expect(others).not.toContain(code);
  });

  it('names only codes of the catalogue', () => {
    for (const code of [...MANAGER_SEED_CODES, ...MANAGER_PART4_SEED_CODES, ...BARBER_SEED_CODES])
      expect(known.has(code)).toBe(true);
  });
});
