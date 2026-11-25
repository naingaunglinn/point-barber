import { EmployeeStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { Assignments, PeopleDirectory } from '../src/modules/people/index.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-schedule-patterns task 3.3 — what `scheduling` reads from `people` through its index (design D1):
// an employee's branch assignments overlapping a range (the PT4 check of a save, the generator's
// per-date filter) and the employee's status (P2-RULE-07: only an ACTIVE employee gets shifts). On the
// fixture database (spec-fixtures §2): U Kyaw Zin at B1, B2 and B3; Ko Naing at B3 until 30/Sep/2026.
let t: SeededApp;
let runner: TransactionRunner;
let assignments: Assignments;
let directory: PeopleDirectory;

beforeAll(async () => {
  t = await startSeededApp({ now: new Date('2026-10-05T11:00:00+06:30') });
  runner = t.app.get(TransactionRunner);
  assignments = t.app.get(Assignments);
  directory = t.app.get(PeopleDirectory);
});
afterAll(async () => {
  await t.close();
});

const { employees, branches } = FIXTURE_IDS;
const codeOf = Object.fromEntries(Object.entries(branches).map(([code, id]) => [id, code]));

const assignmentsOf = (employee: string, from: string, to: string) =>
  runner.run(async (tx) =>
    (await assignments.assignmentsOf(tx, employee, { from, to })).map((row) => ({
      ...row,
      branch_id: codeOf[row.branch_id],
    })),
  );

describe('add-schedule-patterns · Assignments.assignmentsOf (design D1 · owner PT4)', () => {
  it('U Kyaw Zin on 12/Oct/2026: his three assignments, B1, B2 and B3, open from 01/Sep/2026', async () => {
    expect(await assignmentsOf(employees.E001, '2026-10-12', '2026-10-12')).toStrictEqual(
      ['B1', 'B2', 'B3'].map((branch_id) => ({
        branch_id,
        effective_from: '2026-09-01',
        effective_to: null,
      })),
    );
  });

  it('Ko Naing: his B3 assignment, ended 30/Sep/2026, overlaps September, not 06/Oct', async () => {
    expect(await assignmentsOf(employees.E009, '2026-09-30', '2026-10-31')).toStrictEqual([
      { branch_id: 'B3', effective_from: '2026-09-01', effective_to: '2026-09-30' },
    ]);
    expect(await assignmentsOf(employees.E009, '2026-10-01', '2026-10-31')).toStrictEqual([]);
    expect(await assignmentsOf(employees.E009, '2026-10-06', '2026-10-06')).toStrictEqual([]);
  });

  it('a range before the first assignment holds none; Ma Thida (no role) has her B3 row', async () => {
    expect(await assignmentsOf(employees.E004, '2026-08-01', '2026-08-31')).toStrictEqual([]);
    expect(await assignmentsOf(employees.E008, '2026-10-05', '2026-10-26')).toStrictEqual([
      { branch_id: 'B3', effective_from: '2026-09-01', effective_to: null },
    ]);
  });
});

describe('add-schedule-patterns · PeopleDirectory.statusOf (P2-RULE-07)', () => {
  it('Ko Aung is ACTIVE, Ko Naing INACTIVE; an unknown employee has no status', async () => {
    const statusOf = (id: string) => runner.run((tx) => directory.statusOf(tx, id));
    expect(await statusOf(employees.E004)).toBe(EmployeeStatus.ACTIVE);
    expect(await statusOf(employees.E009)).toBe(EmployeeStatus.INACTIVE);
    expect(await statusOf('0199a3f2-0000-7000-8003-00000000ffff')).toBeNull();
  });
});
