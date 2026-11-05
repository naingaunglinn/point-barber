import { SETTING_KEY_PATTERN } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './document.js';

// add-settings-store tasks 1.7 / 3.12 — the generated settings schemas and read paths equal OpenAPI
// Part 1 (API-ERR-03 · API-META-01). Part 1 lives in point-sdd, which CI does not check out, so its
// schemas are copied here from point-sdd docs/api/openapi/part1-foundation.yaml v1.7.0
// (components.schemas SettingDefinition, SettingView, SettingHistoryItem; paths /settings,
// /settings/effective, /settings/{key}/history). A member written `{}` in Part 1 is any JSON value.

type Schema = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const user = (nullable: boolean) => ({
  type: nullable ? ['object', 'null'] : 'object',
  properties: { id: uuid, name_mm: { type: 'string' }, name_en: { type: ['string', 'null'] } },
});
const PART1: Record<string, Schema> = {
  SettingDefinition: {
    type: 'object',
    required: ['type', 'scope', 'module', 'label_key'],
    properties: {
      type: { type: 'string' },
      scope: { type: 'string', enum: ['company', 'branch'] },
      module: { type: 'string' },
      default: {},
      label_key: { type: 'string' },
      help_key: { type: ['string', 'null'] },
      impact_key: { type: ['string', 'null'] },
      validation: { type: 'object' },
      client_readable: { type: 'boolean' },
    },
  },
  SettingView: {
    type: 'object',
    required: ['key', 'definition', 'effective', 'source'],
    properties: {
      key: { type: 'string' },
      definition: { $ref: '#/components/schemas/SettingDefinition' },
      company_value: {},
      branch_value: {},
      effective: {},
      source: { type: 'string', enum: ['default', 'company', 'branch'] },
      editable: { type: 'boolean' },
      updated_at: { ...dateTime, type: ['string', 'null'] },
      updated_by: user(true),
    },
  },
  SettingHistoryItem: {
    type: 'object',
    required: ['id', 'new_value', 'changed_at', 'changed_by'],
    properties: {
      id: uuid,
      branch_id: { ...uuid, type: ['string', 'null'] },
      old_value: {},
      new_value: {},
      changed_at: dateTime,
      changed_by: user(false),
    },
  },
};

const document = buildOpenApiDocument('0.1.0');
const generated = (document.components as { schemas: Record<string, Schema> }).schemas;
const paths = document.paths as Record<string, Record<string, Schema>>;

interface Shape {
  readonly types: string[];
  readonly format?: string;
  readonly values?: unknown[];
  readonly properties?: Record<string, Schema>;
  readonly required: string[];
}

/** One schema read through `$ref` and a nullable `anyOf`. */
function shapeOf(schema: Schema, components: Record<string, Schema>): Shape {
  if (typeof schema.$ref === 'string') {
    const target = components[schema.$ref.split('/').pop() as string];
    if (target === undefined) throw new Error(`unresolved ${schema.$ref}`);
    return shapeOf(target, components);
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = (schema.anyOf as Schema[]).map((branch) => shapeOf(branch, components));
    const [value] = branches.filter((branch) => !branch.types.includes('null'));
    return {
      ...value,
      types: [...new Set(branches.flatMap((branch) => branch.types))].sort(),
      required: value?.required ?? [],
    };
  }
  const types = Array.isArray(schema.type)
    ? [...(schema.type as string[])].sort()
    : typeof schema.type === 'string'
      ? [schema.type]
      : [];
  return {
    types,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    values: (schema.enum as unknown[] | undefined)?.filter((value) => value !== null).sort(),
    properties: schema.properties as Record<string, Schema> | undefined,
    required: (schema.required as string[] | undefined) ?? [],
  };
}

function expectParity(contractIn: Schema, generatedIn: Schema, path: string): void {
  const contract = shapeOf(contractIn, PART1);
  const actual = shapeOf(generatedIn, generated);
  expect(actual.types, `${path} type`).toStrictEqual(contract.types);
  if (contract.format !== undefined) expect(actual.format, `${path} format`).toBe(contract.format);
  if (contract.values !== undefined)
    expect(actual.values, `${path} enum`).toStrictEqual(contract.values);
  if (contract.properties === undefined) return;
  expect(actual.required, `${path} required`).toEqual(expect.arrayContaining(contract.required));
  const members = actual.properties ?? {};
  expect(Object.keys(members).sort(), `${path} members`).toStrictEqual(
    Object.keys(contract.properties).sort(),
  );
  for (const [name, member] of Object.entries(contract.properties))
    expectParity(member, members[name] as Schema, `${path}.${name}`);
}

describe('generated settings schemas = OpenAPI Part 1 v1.7 (add-settings-store task 1.7)', () => {
  it.each(Object.keys(PART1))('%s', (name) => {
    expect(generated[name], name).toBeDefined();
    expectParity(PART1[name] as Schema, generated[name] as Schema, name);
  });

  it('the check bites: a value member that is not any JSON value fails it', () => {
    const view = generated.SettingView as Schema;
    const broken = {
      ...view,
      properties: { ...(view.properties as Record<string, Schema>), effective: { type: 'string' } },
    };
    expect(() => {
      expectParity(PART1.SettingView as Schema, broken, 'SettingView');
    }).toThrow(/SettingView\.effective type/);
  });
});

describe('the settings read paths = OpenAPI Part 1 v1.7 (add-settings-store task 3.12)', () => {
  const parameters = (path: string) =>
    ((paths[path]?.get as Schema).parameters as Schema[]).map((parameter) => [
      parameter.name,
      parameter.in,
      (parameter.schema as Schema).type,
    ]);

  it('listSettings, getEffectiveSettings and getSettingHistory with their parameters', () => {
    expect((paths['/settings']?.get as Schema).operationId).toBe('listSettings');
    expect(parameters('/settings')).toStrictEqual([
      ['module', 'query', 'string'],
      ['branch_id', 'query', 'string'],
    ]);
    expect((paths['/settings/effective']?.get as Schema).operationId).toBe('getEffectiveSettings');
    expect(parameters('/settings/effective')).toStrictEqual([
      ['branch_id', 'query', 'string'],
      ['keys', 'query', 'array'],
    ]);
    expect((paths['/settings/{key}/history']?.get as Schema).operationId).toBe('getSettingHistory');
    expect(parameters('/settings/{key}/history')).toStrictEqual([
      ['key', 'path', 'string'],
      ['branch_id', 'query', 'string'],
      ['cursor', 'query', 'string'],
      ['limit', 'query', 'integer'],
    ]);
  });

  it('the key parameter carries the pattern of the DB CHECK', () => {
    const [key] = (paths['/settings/{key}/history']?.get as Schema).parameters as Schema[];
    expect((key?.schema as Schema).pattern).toBe(SETTING_KEY_PATTERN.source);
    expect((key?.schema as Schema).pattern).toBe('^[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)+$');
  });

  it('the 200 bodies: { items: SettingView[] }, { values, as_of }, { items, next_cursor }', () => {
    const body = (path: string) =>
      (
        ((paths[path]?.get as Schema).responses as Record<string, Schema>)['200']
          ?.content as Record<string, Schema>
      )['application/json']?.schema as Schema;
    expect(body('/settings')).toStrictEqual({
      type: 'object',
      required: ['items'],
      properties: { items: { type: 'array', items: { $ref: '#/components/schemas/SettingView' } } },
    });
    expect(body('/settings/effective')).toMatchObject({
      required: ['values', 'as_of'],
      properties: { as_of: dateTime },
    });
    expect(body('/settings/{key}/history')).toStrictEqual({
      type: 'object',
      required: ['items', 'next_cursor'],
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/SettingHistoryItem' } },
        next_cursor: { type: ['string', 'null'] },
      },
    });
  });
});
