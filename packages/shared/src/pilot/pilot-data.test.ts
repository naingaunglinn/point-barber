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
const example = (): Record<string, any> => JSON.parse(readFileSync(examplePath, 'utf8'));

/** The JSON paths of the issues, joined with dots; [] when the file is accepted. */
const refused = (data: unknown): string[] => {
  const result = PilotDataSchema.safeParse(data);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};
const edit = (change: (data: Record<string, any>) => void) => {
  const data = example();
  change(data);
  return data;
};
const cut = (data: Record<string, any>) => data.categories[0].services[0];

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
    expect(refused(edit((d) => (d.branch.code = code)))).toStrictEqual(paths);
  });

  it.each([
    [1, []],
    [0, ['categories.0.services.0.duration_minutes']],
    [1440, []],
    [1441, ['categories.0.services.0.duration_minutes']],
  ])('duration %d', (minutes, paths) => {
    expect(refused(edit((d) => (cut(d).duration_minutes = minutes)))).toStrictEqual(paths);
  });

  it.each([
    [0, []],
    [-1, ['categories.0.services.0.price']],
    [2500.5, ['categories.0.services.0.price']],
  ])('price %d', (price, paths) => {
    expect(refused(edit((d) => (cut(d).price = price)))).toStrictEqual(paths);
  });

  it('a barber price follows the same rule', () => {
    expect(refused(edit((d) => (cut(d).barber_prices[0].price = -1)))).toStrictEqual([
      'categories.0.services.0.barber_prices.0.price',
    ]);
  });

  it.each([
    ['Barber', []],
    ['Manager', []],
    ['Admin', ['people.2.role']],
  ])('role %s', (role, paths) => {
    expect(refused(edit((d) => (d.people[2].role = role)))).toStrictEqual(paths);
  });

  it('Scenario: A fixture address in the file — a .test address is refused', () => {
    expect(refused(edit((d) => (d.people[0].email = 'aung@point.test')))).toStrictEqual([
      'people.0.email',
    ]);
  });

  it('an address is trimmed and lower-cased', () => {
    const data = PilotDataSchema.parse(
      edit((d) => (d.people[0].email = '  Barber.One@Example.COM ')),
    );
    expect(data.people[0]?.email).toBe('barber.one@example.com');
  });

  it('the same address twice, in another case, is refused at the repeat', () => {
    expect(refused(edit((d) => (d.people[1].email = 'BARBER.ONE@example.com')))).toStrictEqual([
      'people.1.email',
    ]);
  });

  it('a code, a category or a service given twice is refused at the repeat', () => {
    expect(refused(edit((d) => (d.people[2].employee_code = 'X01')))).toStrictEqual([
      'people.2.employee_code',
    ]);
    expect(
      refused(
        edit((d) =>
          d.categories.push({ ...d.categories[0], services: [{ ...cut(d), name_mm: 'other' }] }),
        ),
      ),
    ).toStrictEqual(['categories.1.name_mm']);
    expect(
      refused(edit((d) => (d.categories[0].services[1].name_mm = cut(d).name_mm))),
    ).toStrictEqual(['categories.0.services.1.name_mm']);
  });

  it('a barber price or a service list naming something not in the file is refused', () => {
    expect(refused(edit((d) => (cut(d).barber_prices[0].employee_code = 'X09')))).toStrictEqual([
      'categories.0.services.0.barber_prices.0.employee_code',
    ]);
    expect(
      refused(edit((d) => cut(d).barber_prices.push({ employee_code: 'X01', price: 7000 }))),
    ).toStrictEqual(['categories.0.services.0.barber_prices.1.employee_code']);
    expect(refused(edit((d) => (d.people[1].services = ['no such service'])))).toStrictEqual([
      'people.1.services.0',
    ]);
    expect(refused(edit((d) => (d.people[1].services = [cut(d).name_mm])))).toStrictEqual([]);
  });

  it('a pattern that does not compile, or a sample that does not match, is refused', () => {
    expect(refused(edit((d) => (d.kbzpay.reference_regex = '^EX[0-9{8}$')))).toStrictEqual([
      'kbzpay.reference_regex',
    ]);
    expect(refused(edit((d) => (d.kbzpay.examples = ['EX12345678', 'EX1234'])))).toStrictEqual([
      'kbzpay.examples.1',
    ]);
  });

  it('an unknown key is refused, at any level', () => {
    expect(refused(edit((d) => (d.extra = 1)))).toStrictEqual(['']);
    expect(refused(edit((d) => (d.people[0].branch = 'PX2')))).toStrictEqual(['people.0']);
  });

  it('the KBZPay block is optional; people and categories are not', () => {
    expect(refused(edit((d) => delete d.kbzpay))).toStrictEqual([]);
    // With no people, X01's barber price names nobody either.
    expect(refused(edit((d) => (d.people = [])))).toContain('people');
    expect(refused(edit((d) => (d.categories = [])))).toStrictEqual(['categories']);
  });
});
