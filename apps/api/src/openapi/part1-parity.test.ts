import {
  branchCreateSchema,
  branchStatusSchema,
  branchUpdateSchema,
  socialLinksSchema,
} from '@point/shared';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { buildOpenApiDocument } from './document.js';

// OpenAPI parity of the four response schemas of add-foundation-auth-access (API-ERR-03 · P1.ME.01 ·
// P1.BR.01 · P1.EMP.06 · design D15) — task 1.6. Part 1 lives in point-sdd, which CI does not check
// out, so the schemas are copied here from point-sdd docs/api/openapi/part1-foundation.yaml (v1.6,
// components.schemas MeResponse, Grant, BranchSummary, BranchAssignment and the EmployeeRef that
// MeResponse.employee extends). The full comparison (`openapi:check`) is add-ci-guard-rails.
// add-company-profile task 1.5 adds Company and SocialLinks from Part 1 v1.7 (OpenAPI 1.7.0).
// add-branch-management task 1.7 adds, from Part 1 v1.7 (OpenAPI 1.7.0): Branch, BranchCreate,
// BranchUpdate, the setBranchStatus body and its 409 branch_in_use context — with their maxLength /
// minimum / maximum / maxItems bounds (for every schema here, SocialLinks included) and, by sample
// values, their patterns.

type Schema = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const nullableText = { type: ['string', 'null'] };
const link = { type: ['string', 'null'], format: 'uri', maxLength: 1000, pattern: '^https?://' };
const textUpTo = (maxLength: number) => ({ type: ['string', 'null'], maxLength });
const httpLink = { format: 'uri', maxLength: 1000, pattern: '^https?://' };
// add-branch-management task 1.7 — BranchCreate / BranchUpdate as Part 1 v1.7 writes them (owner BR1:
// no code on the update; owner BR3: address / link limits; the DB columns: phone 50, e-mail 255).
const BRANCH_MEMBERS: Record<string, Schema> = {
  name_mm: { type: 'string', maxLength: 255 },
  name_en: textUpTo(255),
  phone: textUpTo(50),
  email: { type: ['string', 'null'], format: 'email', maxLength: 255 },
  address_mm: textUpTo(1000),
  address_en: textUpTo(1000),
  website_url: { type: ['string', 'null'], ...httpLink },
  social_links: { $ref: '#/components/schemas/SocialLinks' },
  latitude: { type: ['number', 'null'], minimum: -90, maximum: 90 },
  longitude: { type: ['number', 'null'], minimum: -180, maximum: 180 },
  location_radius_meters: { type: ['integer', 'null'], minimum: 10, maximum: 2000 },
  map_url: { type: ['string', 'null'], ...httpLink },
};
const PART1: Record<string, Schema> = {
  // add-company-profile task 1.5 — Part 1 v1.7 (OpenAPI 1.7.0): Company and the SocialLinks it shares
  // with the branches (CP1 · CP2).
  SocialLinks: {
    type: 'object',
    properties: {
      facebook: link,
      tiktok: link,
      viber: { type: ['string', 'null'], maxLength: 1000 },
      instagram: link,
      youtube: link,
      other: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          required: ['label', 'url'],
          properties: {
            label: { type: 'string', maxLength: 50 },
            url: { type: 'string', format: 'uri', maxLength: 1000, pattern: '^https?://' },
          },
        },
      },
    },
  },
  Company: {
    type: 'object',
    required: ['id', 'name_mm', 'status'],
    properties: {
      id: uuid,
      name_mm: { type: 'string' },
      name_en: nullableText,
      logo_url: nullableText,
      phone: nullableText,
      email: nullableText,
      address_mm: nullableText,
      address_en: nullableText,
      website_url: nullableText,
      social_links: { $ref: '#/components/schemas/SocialLinks' },
      status: { type: 'integer', enum: [0, 1] },
      updated_at: dateTime,
    },
  },
  Branch: {
    allOf: [
      { $ref: '#/components/schemas/BranchSummary' },
      {
        type: 'object',
        properties: {
          email: { type: ['string', 'null'] },
          address_mm: { type: ['string', 'null'] },
          address_en: { type: ['string', 'null'] },
          website_url: { type: ['string', 'null'] },
          social_links: { $ref: '#/components/schemas/SocialLinks' },
          latitude: { type: ['number', 'null'] },
          longitude: { type: ['number', 'null'] },
          location_radius_meters: { type: ['integer', 'null'] },
          map_url: { type: ['string', 'null'], format: 'uri' },
          active_employees: { type: 'integer' },
          created_at: dateTime,
          updated_at: dateTime,
        },
      },
    ],
  },
  BranchCreate: {
    type: 'object',
    required: ['code', 'name_mm'],
    properties: {
      code: { type: 'string', pattern: '^[A-Z0-9]{1,10}$' },
      ...BRANCH_MEMBERS,
      is_public: { type: 'boolean' },
    },
  },
  BranchUpdate: {
    type: 'object',
    properties: {
      ...BRANCH_MEMBERS,
      is_public: { type: 'boolean' },
      expected_updated_at: dateTime,
    },
  },
  // The inline request body of setBranchStatus (P1.BR.05).
  BranchStatusRequest: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'integer', enum: [0, 1] },
      reason: { type: 'string', maxLength: 500 },
    },
  },
  // The 409 branch_in_use context of setBranchStatus — its description names the three counts
  // (v1.7, owner BR2); Part 1 gives it no schema of its own.
  BranchInUseContext: {
    type: 'object',
    required: ['open_bookings', 'open_sales', 'active_assignments'],
    properties: {
      open_bookings: { type: 'integer' },
      open_sales: { type: 'integer' },
      active_assignments: { type: 'integer' },
    },
  },
  BranchSummary: {
    type: 'object',
    required: ['id', 'code', 'name_mm', 'status', 'is_public'],
    properties: {
      id: uuid,
      code: { type: 'string' },
      name_mm: { type: 'string' },
      name_en: { type: ['string', 'null'] },
      phone: { type: ['string', 'null'] },
      status: { type: 'integer', enum: [0, 1] },
      is_public: { type: 'boolean' },
    },
  },
  BranchAssignment: {
    type: 'object',
    required: ['id', 'branch', 'effective_from'],
    properties: {
      id: uuid,
      branch: { $ref: '#/components/schemas/BranchSummary' },
      effective_from: { type: 'string', format: 'date' },
      effective_to: { type: ['string', 'null'], format: 'date' },
    },
  },
  Grant: {
    type: 'object',
    required: ['code', 'scope_type', 'branch_ids'],
    properties: {
      code: { type: 'string' },
      scope_type: { type: 'integer', enum: [1, 2] },
      branch_ids: { type: 'array', items: uuid },
    },
  },
  EmployeeRef: {
    type: 'object',
    required: ['id', 'name_mm'],
    properties: {
      id: uuid,
      employee_code: { type: 'string' },
      name_mm: { type: 'string' },
      name_en: { type: ['string', 'null'] },
      photo_url: { type: ['string', 'null'] },
    },
  },
  MeResponse: {
    type: 'object',
    required: [
      'user',
      'employee',
      'grants',
      'branches_in_scope',
      'assigned_branch_ids',
      'effective',
      'settings',
      'system',
      'session',
    ],
    properties: {
      user: {
        type: 'object',
        required: ['id', 'email', 'status'],
        properties: {
          id: uuid,
          email: { type: 'string', format: 'email' },
          status: { type: 'integer', enum: [1, 2] },
          ui_language: { type: ['integer', 'null'], enum: [1, 2, null] },
          last_login_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      employee: {
        allOf: [
          { $ref: '#/components/schemas/EmployeeRef' },
          { type: 'object', properties: { status: { type: 'integer', enum: [1] } } },
        ],
      },
      grants: { type: 'array', items: { $ref: '#/components/schemas/Grant' } },
      branches_in_scope: { type: 'array', items: { $ref: '#/components/schemas/BranchSummary' } },
      today_branch_id: { type: ['string', 'null'], format: 'uuid' },
      assigned_branch_ids: { type: 'array', items: uuid },
      effective: {
        type: 'object',
        required: ['show_own_earnings'],
        properties: { show_own_earnings: { type: 'boolean' } },
      },
      settings: { type: 'object', additionalProperties: true },
      system: {
        type: 'object',
        required: ['maintenance', 'server_time', 'default_language'],
        properties: {
          maintenance: { type: 'boolean' },
          server_time: dateTime,
          default_language: { type: 'integer', enum: [1, 2] },
        },
      },
      session: {
        type: 'object',
        required: ['id', 'created_at'],
        properties: { id: uuid, device_label: { type: ['string', 'null'] }, created_at: dateTime },
      },
    },
  },
};

const document = buildOpenApiDocument('0.1.0');
const generated = (document.components as { schemas: Record<string, Schema> }).schemas;

function deref(schema: Schema, components: Record<string, Schema>): Schema {
  if (typeof schema.$ref === 'string') {
    const target = components[schema.$ref.split('/').pop() as string];
    if (target === undefined) throw new Error(`unresolved ${schema.$ref}`);
    return deref(target, components);
  }
  if (Array.isArray(schema.allOf)) {
    // allOf of objects → one object with the union of members and required lists.
    const parts = (schema.allOf as Schema[]).map((part) => deref(part, components));
    return {
      type: 'object',
      required: parts.flatMap((part) => (part.required as string[] | undefined) ?? []),
      properties: Object.assign({}, ...parts.map((part) => part.properties ?? {})) as Schema,
    };
  }
  return schema;
}

/** The non-null branch of `anyOf [X, null]`, else the schema itself. */
function valueBranch(schema: Schema): Schema {
  if (!Array.isArray(schema.anyOf)) return schema;
  return (schema.anyOf as Schema[]).find((branch) => branch.type !== 'null') ?? schema;
}

const BOUNDS = ['maxLength', 'minimum', 'maximum', 'maxItems'] as const;

function typesOf(schema: Schema): string[] {
  if (Array.isArray(schema.anyOf))
    return [...new Set((schema.anyOf as Schema[]).flatMap(typesOf))].sort();
  if (Array.isArray(schema.type)) return [...(schema.type as string[])].sort();
  return typeof schema.type === 'string' ? [schema.type] : [];
}

function formatOf(schema: Schema): string | undefined {
  if (typeof schema.format === 'string') return schema.format;
  return (schema.anyOf as Schema[] | undefined)?.map(formatOf).find((f) => f !== undefined);
}

/** `enum`, or `const` — Zod writes a one-value enum as `const`. */
function enumOf(schema: Schema): unknown[] | undefined {
  const values = Array.isArray(schema.anyOf)
    ? (schema.anyOf as Schema[]).flatMap((branch) => enumOf(branch) ?? [])
    : 'const' in schema
      ? [schema.const]
      : (schema.enum as unknown[] | undefined);
  return values?.filter((value) => value !== null).sort();
}

/** Every member of Part 1 with its type, format and enum; no member Part 1 does not have. */
function expectParity(part1In: Schema, generatedIn: Schema, path: string): void {
  const part1 = deref(part1In, PART1);
  const actual = deref(generatedIn, generated);
  expect(typesOf(actual), `${path} type`).toStrictEqual(typesOf(part1));
  if (part1.format !== undefined) expect(formatOf(actual), `${path} format`).toBe(part1.format);
  if (part1.enum !== undefined) expect(enumOf(actual), `${path} enum`).toStrictEqual(enumOf(part1));
  for (const bound of BOUNDS) {
    if (part1[bound] !== undefined)
      expect(valueBranch(actual)[bound], `${path} ${bound}`).toBe(part1[bound]);
  }
  if (part1.items !== undefined)
    expectParity(part1.items as Schema, actual.items as Schema, `${path}[]`);
  if (part1.properties === undefined) return;

  // A Part 1 object without a `required` list (SocialLinks) requires no member.
  expect(actual.required ?? [], `${path} required`).toEqual(
    expect.arrayContaining((part1.required as string[] | undefined) ?? []),
  );
  const expected = part1.properties as Record<string, Schema>;
  const members = actual.properties as Record<string, Schema>;
  expect(Object.keys(members).sort(), `${path} members`).toStrictEqual(
    Object.keys(expected).sort(),
  );
  for (const [name, member] of Object.entries(expected))
    expectParity(member, members[name] as Schema, `${path}.${name}`);
}

describe('generated response schemas = OpenAPI Part 1 (task 1.6 · design D15)', () => {
  it.each(['MeResponse', 'Grant', 'BranchSummary', 'BranchAssignment', 'Company', 'SocialLinks'])(
    '%s',
    (name) => {
      expect(generated[name], name).toBeDefined();
      expectParity(PART1[name] as Schema, generated[name] as Schema, name);
    },
  );
});

describe('add-branch-management task 1.7 — the branch schemas = OpenAPI Part 1 v1.7', () => {
  it.each(['Branch', 'BranchInUseContext'])('%s', (name) => {
    expect(generated[name], name).toBeDefined();
    expectParity(PART1[name] as Schema, generated[name] as Schema, name);
  });

  it.each(['BranchCreate', 'BranchUpdate', 'BranchStatusRequest'])(
    '%s — members, types, bounds and exactly the required list of Part 1',
    (name) => {
      const part1 = PART1[name] as Schema;
      const actual = generated[name] as Schema;
      expect(actual, name).toBeDefined();
      expectParity(part1, actual, name);
      expect([...((actual.required as string[] | undefined) ?? [])].sort(), name).toStrictEqual(
        [...((part1.required as string[] | undefined) ?? [])].sort(),
      );
    },
  );

  it('BranchUpdate has no code member (owner BR1)', () => {
    expect(Object.keys(generated.BranchUpdate?.properties as object)).not.toContain('code');
  });

  // Zod states a pattern as a format check, so each Part 1 pattern is compared by sample values: the
  // schema accepts a value exactly when Part 1's pattern matches it.
  const samples = {
    code: ['B4', 'PX12345678', 'PX123456789', 'b4', 'B-4', '', 'B 4'],
    link: [
      'https://facebook.com/point3',
      'http://point.example',
      'javascript:alert(1)',
      'ftp://point.example',
      'point4.example',
      'mailto:point@point.test',
    ],
  };
  const accepts = (schema: z.ZodType, value: string) => schema.safeParse(value).success;
  const member = (shape: Record<string, z.ZodType>, name: string) => {
    const found = shape[name];
    if (found === undefined) throw new Error(`no member ${name}`);
    return found;
  };

  it('BranchCreate.code follows ^[A-Z0-9]{1,10}$', () => {
    const pattern = new RegExp(
      (PART1.BranchCreate?.properties as Record<string, Schema>).code?.pattern as string,
    );
    for (const value of samples.code)
      expect(accepts(member(branchCreateSchema.shape, 'code'), value), value).toBe(
        pattern.test(value),
      );
  });

  it.each([
    ['BranchCreate', branchCreateSchema.shape, ['website_url', 'map_url']],
    ['BranchUpdate', branchUpdateSchema.shape, ['website_url', 'map_url']],
    ['SocialLinks', socialLinksSchema.shape, ['facebook', 'tiktok', 'instagram', 'youtube']],
  ] as const)('%s links follow ^https?://', (name, shape, members) => {
    for (const link of members) {
      const pattern = new RegExp(
        ((PART1[name]?.properties as Record<string, Schema>)[link] as Schema).pattern as string,
      );
      for (const value of samples.link)
        expect(accepts(member(shape, link), value), `${link} ${value}`).toBe(pattern.test(value));
    }
  });

  it('SocialLinks.other[].url follows ^https?://, and the status body takes 0 and 1 only', () => {
    const url = socialLinksSchema.shape.other.unwrap().element.shape.url;
    for (const value of samples.link)
      expect(accepts(url, value), value).toBe(/^https?:\/\//.test(value));
    for (const status of [0, 1])
      expect(branchStatusSchema.safeParse({ status }).success).toBe(true);
    expect(branchStatusSchema.safeParse({ status: 2 }).success).toBe(false);
  });
});
