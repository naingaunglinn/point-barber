import { PERMISSIONS } from '@point/shared';
import { describe, expect, it } from 'vitest';

import {
  BARBER_PART3_SEED_CODES,
  BARBER_SEED_CODES,
  MANAGER_PART2_SEED_CODES,
  MANAGER_PART3_SEED_CODES,
  MANAGER_PART4_SEED_CODES,
  MANAGER_SCHEDULE_SEED_CODES,
  MANAGER_SEED_CODES,
  MANAGER_WEBSITE_SEED_CODES,
} from './seed-roles.js';

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
    for (const code of [
      ...MANAGER_SEED_CODES,
      ...MANAGER_PART2_SEED_CODES,
      ...MANAGER_PART4_SEED_CODES,
      ...MANAGER_SCHEDULE_SEED_CODES,
      ...MANAGER_WEBSITE_SEED_CODES,
      ...BARBER_SEED_CODES,
    ])
      expect(known.has(code)).toBe(true);
  });
});

// add-schedule-patterns task 1.3 — spec "Two schedule codes exist" (Part 2 §12 · D-ROLE-09 ·
// API-PERM-06): the Manager seed holds both schedule codes, the Barber seed neither. The roles on an
// empty database: base-seed.int.test.ts.
describe('seed roles — Part 2 schedule codes', () => {
  it('Manager: schedule.view and schedule.update', () => {
    expect([...MANAGER_SCHEDULE_SEED_CODES]).toStrictEqual(['schedule.view', 'schedule.update']);
  });

  it('Barber: no schedule code — his own pattern and shifts need none', () => {
    expect(BARBER_SEED_CODES.filter((code) => code.startsWith('schedule.'))).toStrictEqual([]);
  });

  it('the Part 1 and Part 4 Manager sets hold no schedule code of their own', () => {
    const others = [...MANAGER_SEED_CODES, ...MANAGER_PART4_SEED_CODES];
    expect(others.filter((code) => code.startsWith('schedule.'))).toStrictEqual([]);
  });
});

// add-service-catalogue task 1.3 — Part 2 §12 "Seed: Manager (v1.3)" · D-ROLE-09 · design D3: the
// Manager reads the catalogue and sets the sale and duration of its branches; the master writes stay
// with the Admin, and the Barber gets no service code.
describe('seed roles — Part 2 service codes', () => {
  it('Manager: service.view and service.update', () => {
    expect([...MANAGER_PART2_SEED_CODES]).toStrictEqual(['service.view', 'service.update']);
  });

  it('keeps service.create and service.delete with the Admin; the Barber holds no service code', () => {
    const manager = [
      ...MANAGER_SEED_CODES,
      ...MANAGER_PART2_SEED_CODES,
      ...MANAGER_PART3_SEED_CODES,
      ...MANAGER_PART4_SEED_CODES,
      ...MANAGER_SCHEDULE_SEED_CODES,
    ];
    expect(manager).not.toContain('service.create');
    expect(manager).not.toContain('service.delete');
    const barber = [...BARBER_SEED_CODES, ...BARBER_PART3_SEED_CODES];
    expect(barber.filter((code) => code.startsWith('service.'))).toStrictEqual([]);
  });
});

// add-customer-management task 1.3 — customers "The four `customer.*` codes are shared-level codes
// with their seed" (Part 3 §7 · D-ROLE-09 · owner #9): Manager view / create / update, Barber view /
// create; `customer.delete` stays with the Admin, who holds every code.
describe('seed roles — Part 3 customer codes', () => {
  it('Manager: customer.view, customer.create and customer.update', () => {
    expect([...MANAGER_PART3_SEED_CODES]).toStrictEqual([
      'customer.view',
      'customer.create',
      'customer.update',
    ]);
  });

  it('Barber: customer.view and customer.create', () => {
    expect([...BARBER_PART3_SEED_CODES]).toStrictEqual(['customer.view', 'customer.create']);
  });

  it('keeps customer.delete with the Admin', () => {
    expect([...MANAGER_PART3_SEED_CODES, ...BARBER_PART3_SEED_CODES]).not.toContain(
      'customer.delete',
    );
  });

  it('names only codes of the catalogue', () => {
    for (const code of [...MANAGER_PART3_SEED_CODES, ...BARBER_PART3_SEED_CODES])
      expect(known.has(code)).toBe(true);
  });
});

// add-website-management task 1.2 — spec "Website has two permission codes with the mixed level"
// (Part 8 §14 · D-ROLE-09): the Manager seed holds both website codes, the Barber seed neither. The
// roles on an empty database: base-seed.int.test.ts; the grants through /v1/me: me.int.test.ts.
describe('seed roles — Part 8 website codes', () => {
  it('Manager: website.view and website.update', () => {
    expect([...MANAGER_WEBSITE_SEED_CODES]).toStrictEqual(['website.view', 'website.update']);
  });

  it('Barber: no website code', () => {
    const barber = [...BARBER_PART3_SEED_CODES, ...BARBER_SEED_CODES];
    expect(barber.filter((code) => code.startsWith('website.'))).toStrictEqual([]);
  });

  it('the other Manager sets hold no website code of their own', () => {
    const others = [
      ...MANAGER_SEED_CODES,
      ...MANAGER_PART3_SEED_CODES,
      ...MANAGER_PART4_SEED_CODES,
      ...MANAGER_SCHEDULE_SEED_CODES,
    ];
    expect(others.filter((code) => code.startsWith('website.'))).toStrictEqual([]);
  });
});
