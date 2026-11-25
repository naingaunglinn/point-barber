import { Injectable } from '@nestjs/common';
import {
  type EmployeeDto,
  type EmployeeListItem,
  type EmployeeListQuery,
  todayMmt,
} from '@point/shared';

import type { ReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import { decodeCursor, encodeCursor } from '../../../common/http/cursor.js';
import { EmployeeListRepository } from '../repositories/employee-list.repository.js';

export interface EmployeePage {
  readonly items: EmployeeListItem[];
  readonly next_cursor: string | null;
  readonly total: number;
}

// What the employee endpoints read (add-employee-management design D1 · D8). The list is built here
// (task 2.5: the scope, the item); the search, the filters and the sorts are task 2.6, the detail 2.7.
@Injectable()
export class EmployeeDirectory {
  constructor(
    private readonly repository: EmployeeListRepository,
    private readonly clock: Clock,
  ) {}

  /** P1.EMP.01 — the employees the caller may see: `scope` is the guard's read scope (D8). */
  async list(query: EmployeeListQuery, scope: ReadScope): Promise<EmployeePage> {
    const filter = {
      scope,
      today: todayMmt(this.clock.now()),
      ...(query.cursor === undefined ? {} : { after: decodeCursor(query.cursor) }),
      take: query.limit + 1,
    };
    const [total, rows] = await Promise.all([
      this.repository.total(filter),
      this.repository.page(filter),
    ]);
    const shown = rows.slice(0, query.limit);
    const last = shown.at(-1);
    return {
      items: shown.map((row) => ({
        ...row,
        status: row.status as EmployeeListItem['status'],
        login_status: row.login_status as EmployeeListItem['login_status'],
        branches: row.branches.map((b) => ({
          ...b,
          status: b.status as EmployeeListItem['status'],
        })),
      })) as EmployeeListItem[],
      next_cursor: rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null,
      total,
    };
  }

  /** P1.EMP.03 — task 2.7. */
  detail(_id: string): Promise<EmployeeDto> {
    throw new Error('EmployeeDirectory.detail is built in task 2.7');
  }
}
