import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './document.js';

// Task 4.20 — the generated Problem and SystemStatus schemas have the required members and types of
// Part 1 (API-ERR-03 · design D5). Part 1 lives in point-sdd, which CI does not check out, so its
// members are copied here from point-sdd docs/api/openapi/part1-foundation.yaml (v1.6.0,
// components.schemas.Problem / SystemStatus). The full comparison (`openapi:check`) is
// add-ci-guard-rails.

type Schema = Record<string, unknown>;
interface Member {
  readonly types: string[];
  readonly format?: string;
}

const PART1 = {
  Problem: {
    required: ['title', 'status', 'code', 'request_id'],
    members: {
      type: { types: ['string'], format: 'uri' },
      title: { types: ['string'] },
      status: { types: ['integer'] },
      code: { types: ['string'] },
      detail: { types: ['string'] },
      errors: { types: ['array'] },
      request_id: { types: ['string'], format: 'uuid' },
      context: { types: ['object'] },
    } as Record<string, Member>,
  },
  SystemStatus: {
    required: ['maintenance', 'version', 'server_time'],
    members: {
      maintenance: { types: ['boolean'] },
      until: { types: ['null', 'string'], format: 'date-time' },
      message_mm: { types: ['null', 'string'] },
      message_en: { types: ['null', 'string'] },
      version: { types: ['string'] },
      server_time: { types: ['string'], format: 'date-time' },
    } as Record<string, Member>,
  },
};
// Part 1 Problem.errors[].items
const PART1_FIELD_ERROR = {
  required: ['field', 'code'],
  members: { field: 'string', code: 'string', params: 'object' },
};

/** The JSON types a schema admits — `type`, a `type` list, or the branches of `anyOf`. */
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

const document = buildOpenApiDocument('0.1.0');
const schemas = (document.components as { schemas: Record<string, Schema> }).schemas;

describe('generated OpenAPI document (task 4.20 · design D5)', () => {
  it('serves under /api/v1 with the two paths of this change and the company of add-company-profile', () => {
    expect(document.servers).toStrictEqual([{ url: '/api/v1' }]);
    expect(Object.keys(document.paths as object).sort()).toStrictEqual([
      '/company',
      '/health',
      '/system/status',
    ]);
  });

  // add-company-profile task 2.10 — copied from Part 1 v1.7 (OpenAPI 1.7.0) `paths./company`.
  it('P1.CO.01 / P1.CO.02 have the tag, permission, header, body and responses of Part 1 v1.7', () => {
    const company = (document.paths as Record<string, Record<string, Schema>>)['/company'] ?? {};
    const { get, patch } = company as { get: Schema; patch: Schema };
    expect(get).toMatchObject({
      tags: ['company'],
      operationId: 'getCompany',
      'x-permission': 'any staff',
    });
    expect(Object.keys(get.responses as object).sort()).toStrictEqual(['200', '401']);
    expect(get.responses).toMatchObject({
      '200': {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Company' } } },
      },
    });
    expect(patch).toMatchObject({
      tags: ['company'],
      operationId: 'patchCompany',
      'x-permission': 'company.update (company master: company scope)',
      parameters: [{ name: 'X-Requested-With', in: 'header', required: true }],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CompanyUpdate' } } },
      },
    });
    expect(Object.keys(patch.responses as object).sort()).toStrictEqual([
      '200',
      '400',
      '401',
      '403',
      '409',
      '422',
    ]);
  });

  it.each(Object.entries(PART1))(
    '%s has the required members and types of Part 1',
    (name, part1) => {
      const generated = schemas[name] as Schema;
      expect(generated).toBeDefined();
      expect(generated.required).toEqual(expect.arrayContaining(part1.required));
      const properties = generated.properties as Record<string, Schema>;
      for (const [member, expected] of Object.entries(part1.members)) {
        const property = properties[member];
        expect(property, `${name}.${member}`).toBeDefined();
        expect(typesOf(property as Schema), `${name}.${member} type`).toStrictEqual(
          [...expected.types].sort(),
        );
        if (expected.format !== undefined)
          expect(formatOf(property as Schema), `${name}.${member} format`).toBe(expected.format);
      }
    },
  );

  it('Problem.errors items have the members and types of Part 1', () => {
    const errors = (schemas.Problem?.properties as Record<string, Schema>).errors as Schema;
    const items = errors.items as Schema;
    expect(items.required).toEqual(expect.arrayContaining(PART1_FIELD_ERROR.required));
    const properties = items.properties as Record<string, Schema>;
    for (const [member, type] of Object.entries(PART1_FIELD_ERROR.members)) {
      expect(typesOf(properties[member] as Schema), member).toStrictEqual([type]);
    }
  });

  it('Health has exactly the two members status and time', () => {
    const health = schemas.Health as Schema;
    expect(Object.keys(health.properties as object).sort()).toStrictEqual(['status', 'time']);
    expect((health.properties as Record<string, Schema>).status?.enum).toStrictEqual([
      'ok',
      'degraded',
    ]);
  });

  it('every $ref points at a schema in components', () => {
    const refs = JSON.stringify(document).match(/#\/components\/schemas\/\w+/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(schemas[ref.split('/').pop() as string], ref).toBeDefined();
  });
});
