import { describe, expect, it } from 'vitest';

import { branchOf } from '../../test/branch-fixtures';
import {
  PUBLIC,
  branchValues,
  createBody,
  createFormSchema,
  emptyBranchValues,
  updateBody,
  updateFormSchema,
} from './form-values';

// add-branch-management tasks 4.4 / 4.5 — the inputs of the branch form become the P1.BR.02 / P1.BR.04
// bodies (design D4 · D5 · D9): a create sends the filled members (an empty radius takes the company
// setting), an edit only the changed ones with `expected_updated_at`, and both are checked by the API's
// schema on the same member paths.

const T1 = '2026-10-05T09:30:00.123+06:30';

describe('createBody', () => {
  it('Scenario: The admin creates B4 — code, names and is_public; no radius, so the setting applies', () => {
    expect(
      createBody({
        ...emptyBranchValues(),
        code: 'B4',
        name_mm: 'ပွိုင့် ၄.၀',
        name_en: 'Point 4.0',
      }),
    ).toStrictEqual({ code: 'B4', name_mm: 'ပွိုင့် ၄.၀', name_en: 'Point 4.0', is_public: true });
  });

  it('sends the coordinates and the radius as numbers, the links that are filled and every Other row', () => {
    const values = emptyBranchValues();
    expect(
      createBody({
        ...values,
        code: 'B4',
        name_mm: 'ပွိုင့် ၄.၀',
        latitude: '16.8409',
        longitude: ' 96.1735 ',
        location_radius_meters: '150',
        is_public: PUBLIC.HIDDEN,
        social_links: {
          ...values.social_links,
          facebook: 'https://facebook.com/point4',
          other: [{ label: 'Map', url: 'https://maps.example/p4' }],
        },
      }),
    ).toStrictEqual({
      code: 'B4',
      name_mm: 'ပွိုင့် ၄.၀',
      is_public: false,
      latitude: 16.8409,
      longitude: 96.1735,
      location_radius_meters: 150,
      social_links: {
        facebook: 'https://facebook.com/point4',
        other: [{ label: 'Map', url: 'https://maps.example/p4' }],
      },
    });
  });
});

describe('the create form schema (branchCreateSchema)', () => {
  it('Scenario: Messages under the code — b4 is invalid_format, nothing to send', () => {
    const result = createFormSchema.safeParse({ ...emptyBranchValues(), code: 'b4', name_mm: 'x' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.code])).toStrictEqual([
      ['code', 'invalid_format'],
    ]);
  });

  it('reports a typed text in a number field as invalid_type and a javascript: link as invalid_format', () => {
    const values = emptyBranchValues();
    const result = createFormSchema.safeParse({
      ...values,
      code: 'B4',
      name_mm: 'ပွိုင့် ၄.၀',
      latitude: 'north',
      social_links: { ...values.social_links, facebook: 'javascript:alert(1)' },
    });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.code])).toStrictEqual([
      ['social_links.facebook', 'invalid_format'],
      ['latitude', 'invalid_type'],
    ]);
  });

  it('an empty Other row asks for its label and link on its own row', () => {
    const values = emptyBranchValues();
    const result = createFormSchema.safeParse({
      ...values,
      code: 'B4',
      name_mm: 'ပွိုင့် ၄.၀',
      social_links: { ...values.social_links, other: [{ label: '', url: '' }] },
    });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
      'social_links.other.0.label',
      'social_links.other.0.url',
    ]);
  });
});

describe('updateBody', () => {
  const stored = branchValues(
    branchOf({ latitude: 16.8409, social_links: { viber: '09 7700 0003' } }),
  );

  it('Scenario: Edit sends only the changed members and expected_updated_at', () => {
    expect(updateBody({ ...stored, phone: '09 7700 0003' }, stored, T1)).toStrictEqual({
      phone: '09 7700 0003',
      expected_updated_at: T1,
    });
  });

  it('sends a cleared member as null, a changed number as a number and the links whole', () => {
    expect(
      updateBody(
        {
          ...stored,
          latitude: '',
          location_radius_meters: '150',
          social_links: { ...stored.social_links, facebook: 'https://facebook.com/point3' },
        },
        stored,
        T1,
      ),
    ).toStrictEqual({
      latitude: null,
      location_radius_meters: 150,
      social_links: { facebook: 'https://facebook.com/point3', viber: '09 7700 0003' },
      expected_updated_at: T1,
    });
  });

  it('never sends the code (owner BR1) and nothing but the version when nothing changed', () => {
    expect(updateBody({ ...stored, code: 'B9' }, stored, T1)).toStrictEqual({
      expected_updated_at: T1,
    });
  });

  it('is checked by branchUpdateSchema: a cleared Myanmar name is refused', () => {
    const result = updateFormSchema(stored, T1).safeParse({ ...stored, name_mm: '  ' });
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.code])).toStrictEqual([
      ['name_mm', 'too_small'],
    ]);
  });
});

describe('branchValues', () => {
  it('turns a stored branch into the inputs: null → empty, numbers as typed, links and rows', () => {
    const values = branchValues(
      branchOf({
        phone: null,
        latitude: 16.8409,
        location_radius_meters: 100,
        is_public: false,
        social_links: {
          facebook: 'https://facebook.com/point3',
          other: [{ label: 'A', url: 'https://a.example' }],
        },
      }),
    );
    expect(values.phone).toBe('');
    expect(values.latitude).toBe('16.8409');
    expect(values.location_radius_meters).toBe('100');
    expect(values.is_public).toBe(PUBLIC.HIDDEN);
    expect(values.social_links).toStrictEqual({
      facebook: 'https://facebook.com/point3',
      tiktok: '',
      instagram: '',
      youtube: '',
      viber: '',
      other: [{ label: 'A', url: 'https://a.example' }],
    });
  });
});
