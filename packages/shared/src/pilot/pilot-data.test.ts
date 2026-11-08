import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PilotDataSchema } from './pilot-data.js';

// add-pilot-data-seed tasks 1.1 / 1.2 — the pilot data file (design D1): spec "The pilot data is read
// from standard input and validated before anything is written", "Fixture data is refused", "The
// pilot database holds exactly one branch", "Each person becomes an invited employee of the pilot
// branch with a branch-scope seed role" (brief S5). Every value is the brief's invented example set.

const examplePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../db/pilot/pilot-data.example.json',
);
const example = (): unknown => JSON.parse(readFileSync(examplePath, 'utf8'));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value at a dot-separated path of the example (`categories.0.services.0.price`). */
const read = (path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => {
    if (Array.isArray(node)) return node[Number(key)];
    return isRecord(node) ? node[key] : undefined;
  }, example());

const readRecord = (path: string): Record<string, unknown> => {
  const value = read(path);
  if (!isRecord(value)) throw new Error(`${path} is not an object in the example`);
  return value;
};

/** A copy of `node` with `value` at `path`; an array index equal to its length appends. */
function put(node: unknown, path: string[], value: unknown): unknown {
  const [key = '', ...rest] = path;
  const next = (child: unknown) => (rest.length === 0 ? value : put(child, rest, value));
  if (Array.isArray(node)) {
    const list = node.map((item: unknown) => item);
    list[Number(key)] = next(list[Number(key)]);
    return list;
  }
  const record = isRecord(node) ? node : {};
  return { ...record, [key]: next(record[key]) };
}

/** The example with one value set (or, with `undefined`, taken out); nothing is mutated. */
const edit = (path: string, value: unknown): unknown => put(example(), path.split('.'), value);

/** The JSON paths of the issues, joined with dots; [] when the file is accepted. */
const refused = (data: unknown): string[] => {
  const result = PilotDataSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};
const SERVICE = 'categories.0.services.0';

describe('db/pilot/pilot-data.example.json (task 1.2)', () => {
  it('parses with PilotDataSchema', () => {
    expect(refused(example())).toStrictEqual([]);
  });

  it('holds no address outside example.com (D-PLT-11 · CLAUDE.md §6)', () => {
    const text = readFileSync(examplePath, 'utf8');
    const addresses = text.match(/[\w.+-]+@[\w.-]+/g) ?? [];
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.filter((address) => !address.endsWith('@example.com'))).toStrictEqual([]);
  });
});

describe('PilotDataSchema (task 1.1 · brief S5)', () => {
  it.each([
    ['PX12345678', []],
    ['PX123456789', ['branch.code']],
    ['px1', ['branch.code']],
  ])('branch code %s', (code, paths) => {
    expect(refused(edit('branch.code', code))).toStrictEqual(paths);
  });

  it.each([
    [1, []],
    [0, ['categories.0.services.0.duration_minutes']],
    [1440, []],
    [1441, ['categories.0.services.0.duration_minutes']],
  ])('duration %d', (minutes, paths) => {
    expect(refused(edit(`${SERVICE}.duration_minutes`, minutes))).toStrictEqual(paths);
  });

  it.each([
    [0, []],
    [-1, ['categories.0.services.0.price']],
    [2500.5, ['categories.0.services.0.price']],
  ])('price %d', (price, paths) => {
    expect(refused(edit(`${SERVICE}.price`, price))).toStrictEqual(paths);
  });

  it('a barber price follows the same rule', () => {
    expect(refused(edit(`${SERVICE}.barber_prices.0.price`, -1))).toStrictEqual([
      'categories.0.services.0.barber_prices.0.price',
    ]);
  });

  it.each([
    ['Barber', []],
    ['Manager', []],
    ['Admin', ['people.2.role']],
  ])('role %s', (role, paths) => {
    expect(refused(edit('people.2.role', role))).toStrictEqual(paths);
  });

  it('Scenario: A fixture address in the file — a .test address is refused', () => {
    expect(refused(edit('people.0.email', 'aung@point.test'))).toStrictEqual(['people.0.email']);
  });

  it('an address is trimmed and lower-cased', () => {
    const data = PilotDataSchema.parse(edit('people.0.email', '  Barber.One@Example.COM '));
    expect(data.people[0]?.email).toBe('barber.one@example.com');
  });

  it('the same address twice, in another case, is refused at the repeat', () => {
    expect(refused(edit('people.1.email', 'BARBER.ONE@example.com'))).toStrictEqual([
      'people.1.email',
    ]);
  });

  it('a code, a category or a service given twice is refused at the repeat', () => {
    expect(refused(edit('people.2.employee_code', 'X01'))).toStrictEqual([
      'people.2.employee_code',
    ]);
    const another = {
      ...readRecord('categories.0'),
      services: [{ ...readRecord(SERVICE), name_mm: 'other' }],
    };
    expect(refused(edit('categories.1', another))).toStrictEqual(['categories.1.name_mm']);
    expect(
      refused(edit('categories.0.services.1.name_mm', read(`${SERVICE}.name_mm`))),
    ).toStrictEqual(['categories.0.services.1.name_mm']);
  });

  it('a barber price or a service list naming something not in the file is refused', () => {
    expect(refused(edit(`${SERVICE}.barber_prices.0.employee_code`, 'X09'))).toStrictEqual([
      'categories.0.services.0.barber_prices.0.employee_code',
    ]);
    expect(
      refused(edit(`${SERVICE}.barber_prices.1`, { employee_code: 'X01', price: 7000 })),
    ).toStrictEqual(['categories.0.services.0.barber_prices.1.employee_code']);
    expect(refused(edit('people.1.services', ['no such service']))).toStrictEqual([
      'people.1.services.0',
    ]);
    expect(refused(edit('people.1.services', [read(`${SERVICE}.name_mm`)]))).toStrictEqual([]);
  });

  it('a pattern that does not compile, or a sample that does not match, is refused', () => {
    expect(refused(edit('kbzpay.reference_regex', '^EX[0-9{8}$'))).toStrictEqual([
      'kbzpay.reference_regex',
    ]);
    expect(refused(edit('kbzpay.examples', ['EX12345678', 'EX1234']))).toStrictEqual([
      'kbzpay.examples.1',
    ]);
  });

  it('an unknown key is refused, at any level', () => {
    expect(refused(edit('extra', 1))).toStrictEqual(['']);
    expect(refused(edit('people.0.branch', 'PX2'))).toStrictEqual(['people.0']);
  });

  it('the KBZPay block is optional; people and categories are not', () => {
    expect(refused(edit('kbzpay', undefined))).toStrictEqual([]);
    // With no people, X01's barber price names nobody either.
    expect(refused(edit('people', []))).toContain('people');
    expect(refused(edit('categories', []))).toStrictEqual(['categories']);
  });
});
