import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from './document.js';

// add-attachments-upload task 1.5 — the generated Attachment, AttachmentUpload, SignedUrl and
// RemoveRequest equal OpenAPI Part 8 (API-ERR-03 · CG-API-03), copied from point-sdd
// docs/api/openapi/part8-platform.yaml (v1.1) because CI does not check out point-sdd: members, types,
// formats, enums, required lists and `maxLength`. `AttachmentUpload.file` is the file part (`format:
// binary`), although the Zod schema reads the file's NAME. Part 8 writes a
// nullable object as `oneOf`, Zod as `anyOf`; both are read as one schema whose types include `null`.

type Schema = Record<string, unknown>;

const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const PART8: Record<string, Schema> = {
  AttachmentUpload: {
    required: ['file', 'purpose'],
    properties: {
      file: { type: 'string', format: 'binary' },
      purpose: { type: 'string', enum: ['image', 'document', 'import'] },
    },
  },
  Attachment: {
    required: [
      'id',
      'entity_type',
      'entity_id',
      'kind',
      'file_name',
      'mime_type',
      'size_bytes',
      'staging',
      'uploaded_by',
      'uploaded_at',
    ],
    properties: {
      id: uuid,
      entity_type: { type: 'string' },
      entity_id: uuid,
      kind: { type: 'integer', enum: [1, 2, 3] },
      file_name: { type: 'string' },
      mime_type: { type: 'string' },
      size_bytes: { type: 'integer' },
      image: {
        oneOf: [
          {
            required: ['width', 'height', 'variants'],
            properties: {
              width: { type: 'integer' },
              height: { type: 'integer' },
              variants: {
                type: 'array',
                items: { type: 'string', enum: ['original', 'w400', 'w800', 'w1600'] },
              },
            },
          },
          { type: 'null' },
        ],
      },
      staging: { type: 'boolean' },
      expires_at: { type: ['string', 'null'], format: 'date-time' },
      uploaded_by: {
        required: ['user_id', 'display_name'],
        properties: { user_id: uuid, display_name: { type: 'string' } },
      },
      uploaded_at: dateTime,
      deleted_at: { type: ['string', 'null'], format: 'date-time' },
    },
  },
  SignedUrl: {
    required: ['url', 'expires_at'],
    properties: { url: { type: 'string', format: 'uri' }, expires_at: dateTime },
  },
  RemoveRequest: { properties: { reason: { type: ['string', 'null'], maxLength: 1000 } } },
};

const generated = (buildOpenApiDocument('0.1.0').components as { schemas: Record<string, Schema> })
  .schemas;

/** The types, format, enum, maxLength, members and required list of a schema, read through `oneOf` / `anyOf`. */
function shapeOf(schema: Schema): Schema {
  const union = (schema.oneOf ?? schema.anyOf) as Schema[] | undefined;
  if (union !== undefined) {
    const branches = union.map(shapeOf);
    const value = branches.find((branch) => !(branch.types as string[]).includes('null'));
    return {
      ...value,
      types: [...new Set(branches.flatMap((branch) => branch.types as string[]))].sort(),
    };
  }
  const types = ([] as unknown[]).concat(schema.type ?? (schema.properties ? 'object' : [])).sort();
  const values = ('const' in schema ? [schema.const] : (schema.enum as unknown[] | undefined))
    ?.filter((value) => value !== null)
    .sort();
  return { ...schema, types, values, required: schema.required ?? [] };
}

function expectParity(contractIn: Schema, generatedIn: Schema, path: string): void {
  const contract = shapeOf(contractIn);
  const actual = shapeOf(generatedIn);
  expect(actual.types, `${path} type`).toStrictEqual(contract.types);
  for (const key of ['format', 'values', 'maxLength'])
    if (contract[key] !== undefined)
      expect(actual[key], `${path} ${key}`).toStrictEqual(contract[key]);
  if (contract.items !== undefined)
    expectParity(contract.items as Schema, actual.items as Schema, `${path}[]`);
  if (contract.properties === undefined) return;
  expect(actual.required, `${path} required`).toEqual(
    expect.arrayContaining(contract.required as string[]),
  );
  const expected = contract.properties as Record<string, Schema>;
  const members = (actual.properties ?? {}) as Record<string, Schema>;
  expect(Object.keys(members).sort(), `${path} members`).toStrictEqual(
    Object.keys(expected).sort(),
  );
  for (const [name, member] of Object.entries(expected))
    expectParity(member, members[name] as Schema, `${path}.${name}`);
}

describe('generated schemas = OpenAPI Part 8 (add-attachments-upload task 1.5)', () => {
  it.each(Object.keys(PART8))('%s', (name) => {
    expect(generated[name], name).toBeDefined();
    expectParity(PART8[name] as Schema, generated[name] as Schema, name);
  });
});
