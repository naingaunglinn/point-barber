import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { FIXTURE_IDS } from '../testing/fixture-ids.js';
import {
  branchesSetSchema,
  categoryCreateSchema,
  categoryOrderSchema,
  categoryUpdateSchema,
  serviceCategoriesQuerySchema,
  serviceCreateSchema,
  serviceOrderSchema,
  servicesQuerySchema,
  serviceUpdateSchema,
} from './catalog.js';

// add-service-catalogue task 2.1 — the request bodies of P2.CAT.02 – 05 and P2.SVC.02 / 04 / 06 / 07 and
// the management filters of P2.CAT.01 / P2.SVC.01 (API Part 2 v1.6 · API-ERR-03 · design D8 / D15):
// the bounds of the spec scenarios, each refused with its Zod issue name. Values from spec-fixtures §1 –
// §3 (Services, Haircut, B1 – B3) and the rows the scenarios create (Kids, Kids haircut).

const B1 = FIXTURE_IDS.branches.B1;
const B3 = FIXTURE_IDS.branches.B3;
const SERVICES = FIXTURE_IDS.serviceCategories.SERVICES;
const HAIRCUT = FIXTURE_IDS.services.HAIRCUT;
const SHAVE = FIXTURE_IDS.services.SHAVE;
const HAIR_WASH = FIXTURE_IDS.services.HAIR_WASH;
const TOKEN = '2026-10-05T09:55:00.123+06:30';

function issuesOf(schema: z.ZodType, value: unknown): z.core.$ZodIssue[] {
  const result = schema.safeParse(value);
  if (result.success) throw new Error(`expected a failure for ${JSON.stringify(value)}`);
  return result.error.issues;
}

const KIDS = { name_mm: 'ကလေး', name_en: 'Kids' };
const KIDS_HAIRCUT = {
  category_id: SERVICES,
  name_mm: 'ကလေးဆံပင်ညှပ်',
  name_en: 'Kids haircut',
  pricing_mode: 1,
};
const atB3 = (minutes: number) => ({ branch_id: B3, sold: true, duration_minutes: minutes });

describe('categoryCreateSchema — "Create a service category" (P2.CAT.02)', () => {
  it('Scenario: Kids — sort_order stays absent, so the service places it last (SC2 ★)', () => {
    expect(categoryCreateSchema.parse(KIDS)).toStrictEqual(KIDS);
    expect(categoryCreateSchema.parse({ ...KIDS, sort_order: 1 })).toMatchObject({ sort_order: 1 });
  });

  it('Scenario: Myanmar name at the limit (150) and one character too long (151)', () => {
    expect(categoryCreateSchema.safeParse({ name_mm: 'က'.repeat(150) }).success).toBe(true);
    expect(issuesOf(categoryCreateSchema, { name_mm: 'က'.repeat(151) })).toMatchObject([
      { code: 'too_big', maximum: 150, path: ['name_mm'] },
    ]);
  });

  it('Scenario: Empty Myanmar name → too_small; a blank one too', () => {
    for (const blank of ['', '   '])
      expect(issuesOf(categoryCreateSchema, { name_mm: blank, name_en: 'Kids' })).toMatchObject([
        { code: 'too_small', minimum: 1, path: ['name_mm'] },
      ]);
  });

  it('Scenario: English left empty — absent stays absent, blank is stored as null', () => {
    expect(categoryCreateSchema.parse({ name_mm: 'ကလေး' })).toStrictEqual({ name_mm: 'ကလေး' });
    expect(categoryCreateSchema.parse({ name_mm: 'ကလေး', name_en: '  ' })).toStrictEqual({
      name_mm: 'ကလေး',
      name_en: null,
    });
    expect(
      issuesOf(categoryCreateSchema, { name_mm: 'ကလေး', name_en: 'K'.repeat(151) }),
    ).toMatchObject([{ code: 'too_big', maximum: 150, path: ['name_en'] }]);
  });
});

describe('categoryUpdateSchema — "Edit a category with optimistic concurrency" (P2.CAT.03)', () => {
  it('Scenario: Rename the English name with the current token', () => {
    expect(
      categoryUpdateSchema.parse({ name_en: 'Barber services', expected_updated_at: TOKEN }),
    ).toStrictEqual({ name_en: 'Barber services', expected_updated_at: TOKEN });
  });

  it('Scenario: No concurrency token → invalid_type on expected_updated_at', () => {
    expect(issuesOf(categoryUpdateSchema, { name_en: 'Barber services' })).toMatchObject([
      { code: 'invalid_type', path: ['expected_updated_at'] },
    ]);
  });

  it('status is 0 or 1; 2 is refused', () => {
    expect(categoryUpdateSchema.parse({ status: 0, expected_updated_at: TOKEN }).status).toBe(0);
    expect(categoryUpdateSchema.parse({ status: 1, expected_updated_at: TOKEN }).status).toBe(1);
    expect(issuesOf(categoryUpdateSchema, { status: 2, expected_updated_at: TOKEN })).toMatchObject(
      [{ code: 'invalid_value', path: ['status'] }],
    );
  });

  it('the name bounds of the create apply to a rename', () => {
    expect(
      issuesOf(categoryUpdateSchema, { name_mm: 'က'.repeat(151), expected_updated_at: TOKEN }),
    ).toMatchObject([{ code: 'too_big', maximum: 150, path: ['name_mm'] }]);
  });
});

describe('serviceCreateSchema — "Create a service" (P2.SVC.02)', () => {
  it('Scenario: Kids haircut at B3 — buffer 5, show_on_website defaults to true', () => {
    expect(
      serviceCreateSchema.parse({ ...KIDS_HAIRCUT, buffer_minutes: 5, branches: [atB3(20)] }),
    ).toStrictEqual({
      ...KIDS_HAIRCUT,
      buffer_minutes: 5,
      show_on_website: true,
      branches: [atB3(20)],
    });
  });

  it('Scenario: No branches yet — buffer defaults to 0, branches stay absent', () => {
    expect(serviceCreateSchema.parse(KIDS_HAIRCUT)).toStrictEqual({
      ...KIDS_HAIRCUT,
      buffer_minutes: 0,
      show_on_website: true,
    });
  });

  it('Scenario: Buffer at the limit (120) and one minute over (121)', () => {
    expect(serviceCreateSchema.safeParse({ ...KIDS_HAIRCUT, buffer_minutes: 120 }).success).toBe(
      true,
    );
    expect(issuesOf(serviceCreateSchema, { ...KIDS_HAIRCUT, buffer_minutes: 121 })).toMatchObject([
      { code: 'too_big', maximum: 120, path: ['buffer_minutes'] },
    ]);
  });

  it('Scenario: Duration bounds — 0 and 1441 refused, 1 and 1440 accepted', () => {
    const create = (minutes: number) => ({ ...KIDS_HAIRCUT, branches: [atB3(minutes)] });
    expect(issuesOf(serviceCreateSchema, create(0))).toMatchObject([
      { code: 'too_small', minimum: 1, path: ['branches', 0, 'duration_minutes'] },
    ]);
    expect(serviceCreateSchema.safeParse(create(1)).success).toBe(true);
    expect(serviceCreateSchema.safeParse(create(1440)).success).toBe(true);
    expect(issuesOf(serviceCreateSchema, create(1441))).toMatchObject([
      { code: 'too_big', maximum: 1440, path: ['branches', 0, 'duration_minutes'] },
    ]);
  });

  it('Scenario: Myanmar name one character too long (201); 200 is accepted', () => {
    expect(
      serviceCreateSchema.safeParse({ ...KIDS_HAIRCUT, name_mm: 'က'.repeat(200) }).success,
    ).toBe(true);
    expect(
      issuesOf(serviceCreateSchema, { ...KIDS_HAIRCUT, name_mm: 'က'.repeat(201) }),
    ).toMatchObject([{ code: 'too_big', maximum: 200, path: ['name_mm'] }]);
  });

  it('pricing_mode 2 passes the schema, so the service can answer 422 options_required (P2-RULE-02)', () => {
    expect(serviceCreateSchema.parse({ ...KIDS_HAIRCUT, pricing_mode: 2 }).pricing_mode).toBe(2);
    expect(issuesOf(serviceCreateSchema, { ...KIDS_HAIRCUT, pricing_mode: 3 })).toMatchObject([
      { code: 'invalid_value', path: ['pricing_mode'] },
    ]);
  });

  it('options and image_attachment_id are stripped until their changes build them (design D13)', () => {
    const parsed = serviceCreateSchema.parse({
      ...KIDS_HAIRCUT,
      options: { groups: [] },
      image_attachment_id: HAIRCUT,
    });
    expect(Object.keys(parsed)).not.toContain('options');
    expect(Object.keys(parsed)).not.toContain('image_attachment_id');
  });

  it('a branch listed twice → one issue on branches (Recorded reading 4)', () => {
    expect(
      issuesOf(serviceCreateSchema, { ...KIDS_HAIRCUT, branches: [atB3(20), atB3(25)] }),
    ).toMatchObject([{ code: 'custom', path: ['branches'] }]);
  });

  it('website texts: blank is null, absent stays absent', () => {
    expect(
      serviceCreateSchema.parse({
        ...KIDS_HAIRCUT,
        show_on_website: false,
        public_description_en: 'Classic cut with a hot towel',
        public_description_mm: ' ',
      }),
    ).toMatchObject({
      show_on_website: false,
      public_description_en: 'Classic cut with a hot towel',
      public_description_mm: null,
    });
  });
});

describe('serviceUpdateSchema — "Edit a service\'s details and website fields" (P2.SVC.04)', () => {
  it('Scenario: A buffer for Haircut — only the sent members', () => {
    expect(
      serviceUpdateSchema.parse({ buffer_minutes: 5, expected_updated_at: TOKEN }),
    ).toStrictEqual({ buffer_minutes: 5, expected_updated_at: TOKEN });
  });

  it('expected_updated_at is required', () => {
    expect(issuesOf(serviceUpdateSchema, { name_en: "Men's haircut" })).toMatchObject([
      { code: 'invalid_type', path: ['expected_updated_at'] },
    ]);
  });

  it('pricing_mode 2 passes the schema, so the service can answer 422 use_options_endpoint', () => {
    expect(
      serviceUpdateSchema.parse({ pricing_mode: 2, expected_updated_at: TOKEN }).pricing_mode,
    ).toBe(2);
  });

  it('status 0 / 1, buffer 0 – 120 and the name bounds as on create', () => {
    expect(serviceUpdateSchema.parse({ status: 0, expected_updated_at: TOKEN }).status).toBe(0);
    expect(
      issuesOf(serviceUpdateSchema, {
        status: 2,
        buffer_minutes: 121,
        name_mm: '',
        expected_updated_at: TOKEN,
      }).map((issue) => [issue.path.join('.'), issue.code]),
    ).toStrictEqual([
      ['name_mm', 'too_small'],
      ['buffer_minutes', 'too_big'],
      ['status', 'invalid_value'],
    ]);
  });

  it('a move names the new category; an unknown id format is refused', () => {
    expect(
      serviceUpdateSchema.parse({ category_id: SERVICES, expected_updated_at: TOKEN }).category_id,
    ).toBe(SERVICES);
    expect(
      issuesOf(serviceUpdateSchema, { category_id: 'kids', expected_updated_at: TOKEN }),
    ).toMatchObject([{ code: 'invalid_format', path: ['category_id'] }]);
  });
});

describe('branchesSetSchema — "Sell a service at a branch and set its duration there" (P2.SVC.06)', () => {
  it('Scenario: A shorter Haircut at B3', () => {
    expect(branchesSetSchema.parse({ items: [atB3(25)] })).toStrictEqual({ items: [atB3(25)] });
  });

  it('Scenario: A branch twice → one issue on items', () => {
    expect(
      issuesOf(branchesSetSchema, {
        items: [atB3(25), { branch_id: B3, sold: false, duration_minutes: 25 }],
      }),
    ).toMatchObject([{ code: 'custom', path: ['items'] }]);
  });

  it('two branches, each once; every member is required; duration 1 – 1440', () => {
    expect(
      branchesSetSchema.safeParse({
        items: [atB3(25), { branch_id: B1, sold: true, duration_minutes: 25 }],
      }).success,
    ).toBe(true);
    expect(
      issuesOf(branchesSetSchema, { items: [{ branch_id: B3, duration_minutes: 0 }] }).map(
        (issue) => issue.path.join('.'),
      ),
    ).toStrictEqual(['items.0.sold', 'items.0.duration_minutes']);
    expect(issuesOf(branchesSetSchema, {})).toMatchObject([
      { code: 'invalid_type', path: ['items'] },
    ]);
  });
});

describe('the two order bodies (P2.CAT.05 · P2.SVC.07)', () => {
  it('Scenario: Services in a new order', () => {
    const ids = [SHAVE, HAIRCUT, HAIR_WASH];
    expect(serviceOrderSchema.parse({ category_id: SERVICES, ids })).toStrictEqual({
      category_id: SERVICES,
      ids,
    });
    expect(issuesOf(serviceOrderSchema, { ids })).toMatchObject([
      { code: 'invalid_type', path: ['category_id'] },
    ]);
  });

  it('at least one id (minItems 1), each a uuid', () => {
    expect(categoryOrderSchema.parse({ ids: [SERVICES] })).toStrictEqual({ ids: [SERVICES] });
    expect(issuesOf(categoryOrderSchema, { ids: [] })).toMatchObject([
      { code: 'too_small', minimum: 1, path: ['ids'] },
    ]);
    expect(issuesOf(categoryOrderSchema, { ids: ['kids'] })).toMatchObject([
      { code: 'invalid_format', path: ['ids', 0] },
    ]);
  });
});

describe('the management filters of the two lists (P2.CAT.01 · P2.SVC.01 · Recorded reading 1)', () => {
  it('categories: no filter → status absent (the picker request), both flags false', () => {
    expect(serviceCategoriesQuerySchema.parse({})).toStrictEqual({
      include_archived: false,
      include_counts: false,
    });
  });

  it('categories: status repeatable, flags true / false only', () => {
    expect(
      serviceCategoriesQuerySchema.parse({
        status: ['0', '1'],
        include_archived: 'true',
        include_counts: 'true',
      }),
    ).toStrictEqual({ status: [0, 1], include_archived: true, include_counts: true });
    expect(serviceCategoriesQuerySchema.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(issuesOf(serviceCategoriesQuerySchema, { include_counts: 'yes' })).toMatchObject([
      { code: 'invalid_value', path: ['include_counts'] },
    ]);
    expect(issuesOf(serviceCategoriesQuerySchema, { status: '2' })).toMatchObject([
      { code: 'invalid_value', path: ['status', 0] },
    ]);
  });

  it('services: the picker request — no status, no include_archived, sold = here', () => {
    expect(servicesQuerySchema.parse({ branch_id: B3, pricing_mode: '1' })).toStrictEqual({
      branch_id: B3,
      pricing_mode: 1,
      include_archived: false,
      sold: 'here',
      limit: 25,
    });
  });

  it('Scenario: A barber asks for inactive services — status=0 parses to [0]', () => {
    expect(servicesQuerySchema.parse({ status: '0' }).status).toStrictEqual([0]);
    expect(issuesOf(servicesQuerySchema, { status: '' })).toMatchObject([
      { code: 'invalid_format', path: ['status', 0] },
    ]);
  });

  it('Scenario: Without a branch — sold=all needs branch_id', () => {
    expect(issuesOf(servicesQuerySchema, { sold: 'all' })).toMatchObject([
      { code: 'invalid_type', path: ['branch_id'] },
    ]);
    expect(servicesQuerySchema.parse({ sold: 'all', branch_id: B3 })).toMatchObject({
      sold: 'all',
      branch_id: B3,
    });
    expect(issuesOf(servicesQuerySchema, { sold: 'some', branch_id: B3 })).toMatchObject([
      { code: 'invalid_value', path: ['sold'] },
    ]);
  });
});
