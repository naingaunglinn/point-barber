import { describe, expect, it } from 'vitest';

import type { Tx } from '../../../common/database/transaction-runner.js';
import type { ShiftBranchRow, ShiftsRepository } from '../repositories/shifts.repository.js';
import { TodayShifts } from './today-shifts.js';

// add-website-management task 5.3 — `TodayShifts.branchesOf` (design D1 · D8 · P8.WEB.09 / P8.PUB.04): per
// employee the public branches of the day's shifts in shift order; an employee without one is absent.
const db = {} as Tx;
const B3 = { id: 'b3', code: 'B3', name_mm: 'Point 3.0 မ', name_en: 'Point 3.0' };
const B1 = { id: 'b1', code: 'B1', name_mm: 'Point 1.0 မ', name_en: null };
const at = (hour: number) => new Date(`2026-10-05T0${hour}:00:00.000Z`);
const shift = (
  employee: string,
  branch: ShiftBranchRow['branch'],
  start: number,
): ShiftBranchRow => ({
  employee_id: employee,
  starts_at: at(start),
  ends_at: at(start + 1),
  branch,
});

function shifts(rows: ShiftBranchRow[]) {
  const asked: unknown[] = [];
  const repository = {
    publicBranchShifts: (_db: Tx, ids: readonly string[], date: string) => {
      asked.push({ ids, date });
      return Promise.resolve(rows);
    },
  } as unknown as ShiftsRepository;
  return { today: new TodayShifts(repository), asked };
}

describe('add-website-management · TodayShifts.branchesOf (task 5.3)', () => {
  it("groups the repository's rows per employee, keeping shift order and times", async () => {
    const { today } = shifts([shift('aung', B3, 2), shift('aung', B1, 5), shift('min', B3, 3)]);
    const result = await today.branchesOf(db, {
      employee_ids: ['aung', 'min', 'htet'],
      date: '2026-10-05',
    });
    expect([...result.keys()]).toStrictEqual(['aung', 'min']);
    expect(result.get('aung')?.map((branch) => branch.code)).toStrictEqual(['B3', 'B1']);
    expect(result.get('aung')?.[0]).toStrictEqual({ ...B3, starts_at: at(2), ends_at: at(3) });
  });

  it('asks for nothing when no employee is given', async () => {
    const { today, asked } = shifts([]);
    expect((await today.branchesOf(db, { employee_ids: [], date: '2026-10-05' })).size).toBe(0);
    expect(asked).toStrictEqual([]);
  });
});
