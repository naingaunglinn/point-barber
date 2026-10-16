// The package itself does no I/O (CG-ARCH-07); only this test reads files, so only it sees Node.
/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { PERMISSIONS, type PermissionCode, permissionLevel } from './catalogue.js';
import { permissionCatalogueSchema, permissionEntrySchema } from './schema.js';

// Spec "The permission catalogue is one file and holds the 21 Part 1 codes" (D-ROLE-08 · ADR-011 ·
// ADR-012 · design D10) — add-foundation-auth-access task 1.4.
const shared = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const json: unknown = JSON.parse(
  readFileSync(join(shared, 'definitions/permissions.json'), 'utf8'),
);

/** The modules of Part 1 §10; the codes of later parts are added by their changes (Part 4 §9 below). */
const PART1_MODULES = new Set(['company', 'branch', 'employee', 'role', 'settings']);
const PART4_MODULES = new Set(['visit', 'sale', 'payment', 'discount', 'payment_method']);

const count = <K extends string>(values: readonly K[]) =>
  values.reduce<Record<string, number>>(
    (acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }),
    {},
  );

describe('add-foundation-auth-access · access · The permission catalogue is one file and holds the 21 Part 1 codes', () => {
  it('Scenario: Count by level and by kind', () => {
    const all = permissionCatalogueSchema.parse(json);
    const entries = all.filter((entry) => PART1_MODULES.has(entry.module));
    expect(entries).toHaveLength(21);
    expect(count(entries.map((entry) => entry.level))).toStrictEqual({
      company: 8,
      branch: 11,
      mixed: 2,
    });
    expect(count(entries.map((entry) => entry.kind))).toStrictEqual({ crud: 16, special: 5 });
    expect(all.filter((entry) => entry.action === 'manage')).toStrictEqual([]);
    for (const entry of all) expect(entry.label_key).toBe(`permission.${entry.code}`);
  });

  it('Scenario: A code that is not in the file does not compile', () => {
    const known: PermissionCode = 'employee.view';
    // @ts-expect-error — 'employee.manage' is not in permissions.json; `pnpm typecheck` fails here
    // the day PermissionCode accepts any string.
    const unknown: PermissionCode = 'employee.manage';
    expect([known, unknown]).toHaveLength(2);
  });

  it('holds the codes and levels of the Part 1 table', () => {
    const part1 = PERMISSIONS.filter((entry) => PART1_MODULES.has(entry.module));
    expect(Object.fromEntries(part1.map((entry) => [entry.code, entry.level]))).toStrictEqual({
      'company.view': 'company',
      'company.update': 'company',
      'branch.view': 'branch',
      'branch.create': 'company',
      'branch.update': 'branch',
      'branch.delete': 'company',
      'employee.view': 'branch',
      'employee.create': 'branch',
      'employee.update': 'branch',
      'employee.delete': 'branch',
      'employee.rating_update': 'branch',
      'employee.earnings_update': 'branch',
      'employee.access_update': 'branch',
      'employee.branch_assign': 'branch',
      'role.view': 'company',
      'role.create': 'company',
      'role.update': 'company',
      'role.delete': 'company',
      'role.assign': 'branch',
      'settings.view': 'mixed',
      'settings.update': 'mixed',
    });
  });

  it('marks the five special actions', () => {
    expect(
      PERMISSIONS.filter(
        (entry) => PART1_MODULES.has(entry.module) && entry.kind === 'special',
      ).map((entry) => entry.code),
    ).toStrictEqual([
      'employee.rating_update',
      'employee.earnings_update',
      'employee.access_update',
      'employee.branch_assign',
      'role.assign',
    ]);
  });

  it('holds nothing but the codes of Part 1 and Part 4', () => {
    const modules = new Set([...PART1_MODULES, ...PART4_MODULES]);
    expect(PERMISSIONS.filter((entry) => !modules.has(entry.module))).toStrictEqual([]);
  });

  it('answers the level of a code', () => {
    expect(permissionLevel('settings.update')).toBe('mixed');
    expect(permissionLevel('role.assign')).toBe('branch');
  });

  it('typed copy equals the JSON file (permissions:generate --check)', () => {
    const result = spawnSync(
      process.execPath,
      [join(shared, 'scripts/generate-permissions.mjs'), '--check'],
      { encoding: 'utf8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(PERMISSIONS).toStrictEqual(json);
  });
});

// add-walkin-visit-checkout task 1.3 — the 22 codes of Part 4 §9 with their kind and level (ADR-011 ·
// ADR-012).
describe('add-walkin-visit-checkout · the 22 Part 4 codes', () => {
  it('holds the codes, kinds and levels of the Part 4 table', () => {
    const part4 = PERMISSIONS.filter((entry) => PART4_MODULES.has(entry.module));
    expect(
      Object.fromEntries(part4.map((entry) => [entry.code, `${entry.kind} · ${entry.level}`])),
    ).toStrictEqual({
      'visit.view': 'crud · branch',
      'visit.update': 'crud · branch',
      'visit.delete': 'crud · branch',
      'sale.view': 'crud · branch',
      'sale.create': 'crud · branch',
      'sale.delete': 'crud · branch',
      'sale.finish_override': 'special · branch',
      'sale.override_price': 'special · branch',
      'sale.late_entry': 'special · branch',
      'sale.refund': 'special · branch',
      'sale.adjust': 'special · branch',
      'payment.view': 'crud · branch',
      'payment.verify': 'special · branch',
      'discount.view': 'crud · mixed',
      'discount.create': 'crud · company',
      'discount.update': 'crud · company',
      'discount.delete': 'crud · company',
      'discount.approve': 'special · branch',
      'payment_method.view': 'crud · company',
      'payment_method.create': 'crud · company',
      'payment_method.update': 'crud · company',
      'payment_method.delete': 'crud · company',
    });
  });

  it('types a Part 4 code', () => {
    const code: PermissionCode = 'sale.finish_override';
    expect(permissionLevel(code)).toBe('branch');
  });
});

describe('permissionEntrySchema', () => {
  const entry = {
    code: 'branch.view',
    module: 'branch',
    action: 'view',
    kind: 'crud',
    level: 'branch',
    label_key: 'permission.branch.view',
    description: 'branch · view',
  };

  it('accepts a well-formed entry', () => {
    expect(permissionEntrySchema.parse(entry)).toStrictEqual(entry);
  });

  it.each([
    [
      'a manage action',
      { code: 'branch.manage', action: 'manage', label_key: 'permission.branch.manage' },
    ],
    ['a code that is not module.action', { code: 'branch.read' }],
    ['another label key', { label_key: 'branch.view' }],
    ['an unknown level', { level: 'global' }],
    ['an unknown kind', { kind: 'field' }],
    ['an extra member', { scope: 'company' }],
  ])('refuses %s', (_, change) => {
    expect(permissionEntrySchema.safeParse({ ...entry, ...change }).success).toBe(false);
  });

  it('refuses a code declared twice', () => {
    expect(permissionCatalogueSchema.safeParse([entry, entry]).success).toBe(false);
  });
});
