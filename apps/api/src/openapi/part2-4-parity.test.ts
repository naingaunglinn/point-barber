import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './document.js';
import { PART2_4_SCHEMAS } from './part2-4-contract.js';

// add-walkin-visit-checkout task 2.5 — the generated response schemas of tasks 2.2 – 2.4 equal the
// Part 2 / 3 / 4 OpenAPI schemas (API-ERR-03): every member with its type, format and enum, the
// contract's required members, and no member the contract does not have. Part 4 writes a nullable
// object as `oneOf: [object, null]` and Zod as `anyOf`; both are read as one schema whose types
// include `null`.

type Schema = Record<string, unknown>;

const document = buildOpenApiDocument('0.1.0');
const generated = (document.components as { schemas: Record<string, Schema> }).schemas;

interface Shape {
  readonly types: string[];
  readonly format?: string;
  readonly values?: unknown[];
  readonly properties?: Record<string, Schema>;
  readonly required: string[];
  readonly items?: Schema;
}

/** One schema read through `$ref`, `allOf` and `oneOf` / `anyOf` (a nullable value). */
function shapeOf(schema: Schema, components: Record<string, Schema>): Shape {
  if (typeof schema.$ref === 'string') {
    const target = components[schema.$ref.split('/').pop() as string];
    if (target === undefined) throw new Error(`unresolved ${schema.$ref}`);
    return shapeOf(target, components);
  }
  const union = (schema.oneOf ?? schema.anyOf) as Schema[] | undefined;
  if (union !== undefined) {
    const branches = union.map((branch) => shapeOf(branch, components));
    const values = branches.flatMap((branch) => branch.values ?? []);
    const [value] = branches.filter((branch) => !branch.types.includes('null'));
    return {
      ...value,
      types: [...new Set(branches.flatMap((branch) => branch.types))].sort(),
      values: values.length === 0 ? undefined : values.sort(),
      required: value?.required ?? [],
    };
  }
  if (Array.isArray(schema.allOf)) {
    const parts = (schema.allOf as Schema[]).map((part) => shapeOf(part, components));
    return {
      types: ['object'],
      required: parts.flatMap((part) => part.required),
      properties: Object.assign({}, ...parts.map((part) => part.properties ?? {})) as Record<
        string,
        Schema
      >,
    };
  }
  const types = Array.isArray(schema.type)
    ? [...(schema.type as string[])].sort()
    : typeof schema.type === 'string'
      ? [schema.type]
      : [];
  // `enum`, or `const` — Zod writes a one-value enum as `const`.
  const values = ('const' in schema ? [schema.const] : (schema.enum as unknown[] | undefined))
    ?.filter((value) => value !== null)
    .sort();
  return {
    types,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    values,
    properties: schema.properties as Record<string, Schema> | undefined,
    required: (schema.required as string[] | undefined) ?? [],
    items: schema.items as Schema | undefined,
  };
}

function expectParity(contractIn: Schema, generatedIn: Schema, path: string): void {
  const contract = shapeOf(contractIn, PART2_4_SCHEMAS);
  const actual = shapeOf(generatedIn, generated);
  expect(actual.types, `${path} type`).toStrictEqual(contract.types);
  if (contract.format !== undefined) expect(actual.format, `${path} format`).toBe(contract.format);
  if (contract.values !== undefined)
    expect(actual.values, `${path} enum`).toStrictEqual(contract.values);
  if (contract.items !== undefined)
    expectParity(contract.items, actual.items as Schema, `${path}[]`);
  if (contract.properties === undefined) return;

  expect(actual.required, `${path} required`).toEqual(expect.arrayContaining(contract.required));
  const members = actual.properties ?? {};
  expect(Object.keys(members).sort(), `${path} members`).toStrictEqual(
    Object.keys(contract.properties).sort(),
  );
  for (const [name, member] of Object.entries(contract.properties))
    expectParity(member, members[name] as Schema, `${path}.${name}`);
}

describe('generated response schemas = OpenAPI Part 2 / 3 / 4 (add-walkin-visit-checkout task 2.5)', () => {
  it.each(Object.keys(PART2_4_SCHEMAS))('%s', (name) => {
    expect(generated[name], name).toBeDefined();
    expectParity(PART2_4_SCHEMAS[name] as Schema, generated[name] as Schema, name);
  });

  it('a nullable member stays nullable and a required one required (the check bites)', () => {
    const sale = generated.Sale as Schema;
    const broken = {
      ...sale,
      properties: { ...(sale.properties as Record<string, Schema>), visit_id: { type: 'string' } },
    };
    expect(() => {
      expectParity(PART2_4_SCHEMAS.Sale as Schema, broken, 'Sale');
    }).toThrow(/Sale\.visit_id type/);
  });
});
