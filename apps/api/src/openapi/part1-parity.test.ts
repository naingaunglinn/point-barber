import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './document.js';

// OpenAPI parity of the four response schemas of add-foundation-auth-access (API-ERR-03 · P1.ME.01 ·
// P1.BR.01 · P1.EMP.06 · design D15) — task 1.6. Part 1 lives in point-sdd, which CI does not check
// out, so the schemas are copied here from point-sdd docs/api/openapi/part1-foundation.yaml (v1.6,
// components.schemas MeResponse, Grant, BranchSummary, BranchAssignment and the EmployeeRef that
// MeResponse.employee extends). The full comparison (`openapi:check`) is add-ci-guard-rails.

type Schema = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const PART1: Record<string, Schema> = {
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
  if (part1.items !== undefined)
    expectParity(part1.items as Schema, actual.items as Schema, `${path}[]`);
  if (part1.properties === undefined) return;

  expect(actual.required, `${path} required`).toEqual(
    expect.arrayContaining(part1.required as string[]),
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
  it.each(['MeResponse', 'Grant', 'BranchSummary', 'BranchAssignment'])('%s', (name) => {
    expect(generated[name], name).toBeDefined();
    expectParity(PART1[name] as Schema, generated[name] as Schema, name);
  });
});
