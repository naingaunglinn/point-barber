import { describe, expect, it } from 'vitest';

import {
  AttachmentPolicies,
  type AttachmentPolicy,
  PublicMediaRules,
  SingleImageFields,
} from './attachment-registries.js';
import { registerUploadPolicies } from './upload-policies.js';

// add-attachments-upload task 3.2 — "Policies, single-image fields and public rules are registered once, at
// start-up, by the module that owns the rows" (CG-ARCH-02 · CG-ARCH-08 · R5).

const policy = (entity_type: string, kind: number): AttachmentPolicy => ({
  entity_type,
  kind,
  read: () => 'allow',
  remove: () => 'allow',
});
const COMPANY = '0199a3f2-0000-7000-8a00-0000000000c0';
const AUNG = '0199a3f2-0000-7000-8002-000000000e04';
const MIN = '0199a3f2-0000-7000-8002-000000000e05';

describe('the registries refuse a second and a late registration', () => {
  it('Scenario: A duplicate registration — the message names expenses and 1', () => {
    const policies = new AttachmentPolicies();
    policies.register(policy('expenses', 1));
    expect(() => policies.register(policy('expenses', 1))).toThrow(
      'AttachmentPolicies: ("expenses", 1) is registered twice',
    );
    policies.register(policy('expenses', 2));
  });

  it('Scenario: A late registration throws and the registry is unchanged', () => {
    const policies = new AttachmentPolicies();
    policies.register(policy('companies', 2));
    policies.freeze();
    expect(() => policies.register(policy('services', 2))).toThrow(/registered after start-up/);
    expect(policies.of('services', 2)).toBeUndefined();
    expect(policies.of('companies', 2)).toBeDefined();
  });

  it('single-image fields and public rules stop on a duplicate and on a late registration', () => {
    const fields = new SingleImageFields();
    const field = {
      field: 'company_logo',
      member: 'logo_attachment_id',
      entity_type: 'companies',
      current: () => Promise.resolve(null),
    };
    fields.register(field);
    expect(() => fields.register(field)).toThrow(
      'SingleImageFields: "company_logo" is registered twice',
    );
    fields.freeze();
    expect(() => fields.register({ ...field, field: 'employee_photo' })).toThrow(/after start-up/);

    const rules = new PublicMediaRules();
    rules.register({ entity_type: 'companies', isPublic: () => true });
    expect(() => rules.register({ entity_type: 'companies', isPublic: () => true })).toThrow(
      'PublicMediaRules: "companies" is registered twice',
    );
    rules.freeze();
    expect(() => rules.register({ entity_type: 'services', isPublic: () => true })).toThrow(
      /after start-up/,
    );
  });
});

describe('the policies of this change', () => {
  const policies = new AttachmentPolicies();
  registerUploadPolicies(policies, () => Promise.resolve(COMPANY));

  // Every pair Part 8 names (DB Part 8 `attachments` · P8-RULE-03 policy table): registered by this change,
  // or marked for the change that creates its rows. A later change's first task removes its mark.
  const PART_8_PAIRS: readonly (readonly [string, number, 'registered' | 'later change'])[] = [
    ['uploads', 1, 'registered'],
    ['uploads', 2, 'registered'],
    ['uploads', 3, 'registered'],
    ['companies', 2, 'registered'],
    ['employees', 2, 'registered'],
    ['employees', 1, 'later change'],
    ['expenses', 1, 'later change'],
    ['expenses', 2, 'later change'],
    ['manual_incomes', 1, 'later change'],
    ['manual_incomes', 2, 'later change'],
    ['services', 2, 'later change'],
    ['site', 2, 'later change'],
    ['import_jobs', 3, 'later change'],
    ['exports', 1, 'later change'],
  ];

  it.each(PART_8_PAIRS)('(%s, %i) is %s', (entityType, kind, state) => {
    expect(policies.of(entityType, kind) !== undefined).toBe(state === 'registered');
  });

  it('a pair nothing registered fails closed — sales, refunds and a typo have no policy', () => {
    for (const type of ['sales', 'refunds', 'widgets'])
      expect(policies.ofEntityType(type)).toStrictEqual([]);
  });

  it('staging rows: the uploader reads and removes; another user, the admin included, gets hidden', async () => {
    for (const kind of [1, 2, 3]) {
      const own = policies.of('uploads', kind);
      expect(await own?.read({ user_id: AUNG }, AUNG)).toBe('allow');
      expect(await own?.remove({ user_id: AUNG }, AUNG)).toBe('allow');
      expect(await own?.read({ user_id: MIN }, AUNG)).toBe('hidden');
      expect(await own?.remove({ user_id: MIN }, AUNG)).toBe('hidden');
    }
  });

  it('logo and photo: any signed-in staff member reads and may ask to remove; an unknown company is hidden', async () => {
    const logo = policies.of('companies', 2);
    expect(await logo?.read({ user_id: AUNG }, COMPANY)).toBe('allow');
    expect(await logo?.read({ user_id: AUNG }, AUNG)).toBe('hidden');
    expect(await logo?.remove({ user_id: AUNG }, COMPANY)).toBe('allow');
    expect(await logo?.remove({ user_id: AUNG }, AUNG)).toBe('hidden');
    const photo = policies.of('employees', 2);
    expect(await photo?.read({ user_id: MIN }, AUNG)).toBe('allow');
    expect(await photo?.remove({ user_id: MIN }, AUNG)).toBe('allow');
  });
});
