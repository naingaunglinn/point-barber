import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';

// The one query of P1.EMP.01 (add-employee-management design D8): the employees a caller may see, one
// page, with the active branches and the active roles of the page aggregated in the same statement.

const branchSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.number(),
  is_public: z.boolean(),
});
const roleSchema = z.object({
  id: z.uuid(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
});
const rowSchema = z.object({
  id: z.uuid(),
  employee_code: z.string(),
  name_mm: z.string(),
  name_en: z.string().nullable(),
  photo_url: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.number(),
  login_status: z.number(),
  join_date: z.string().nullable(),
  branches: z.array(branchSchema),
  roles: z.array(roleSchema),
});
const totalSchema = z.object({ n: z.bigint() });

export type EmployeeListRow = z.infer<typeof rowSchema>;

export interface EmployeeListFilter {
  /** `all` — a company-scope holder; a list — the branches of a branch-scope holder. */
  readonly scope: 'all' | readonly string[];
  /** The Myanmar business date: "active" means `effective_from ≤ today ≤ coalesce(effective_to, today)`. */
  readonly today: string;
  readonly after?: string;
  /** Rows to read; the caller asks for one more than it shows. */
  readonly take: number;
}

@Injectable()
export class EmployeeListRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The employees in scope: company → all; branches → an active assignment at a branch of the scope. */
  private visible(filter: EmployeeListFilter) {
    if (filter.scope === 'all') return Prisma.sql`TRUE`;
    return Prisma.sql`EXISTS (
      SELECT 1 FROM employee_branches s
      WHERE s.employee_id = e.id AND s.branch_id = ANY(${[...filter.scope]}::uuid[])
        AND s.effective_from <= ${filter.today}::date
        AND coalesce(s.effective_to, ${filter.today}::date) >= ${filter.today}::date)`;
  }

  async total(filter: EmployeeListFilter): Promise<number> {
    const rows = await this.db.$queryRaw<unknown[]>`
      SELECT count(*) AS n FROM employees e WHERE ${this.visible(filter)}`;
    return Number(totalSchema.parse(rows[0]).n);
  }

  /** Ordered by `name_mm`, then `id`; after the row `filter.after` when it is given. */
  async page(filter: EmployeeListFilter): Promise<EmployeeListRow[]> {
    const after =
      filter.after === undefined
        ? Prisma.empty
        : Prisma.sql`AND (e.name_mm, e.id) >
            (SELECT c.name_mm, c.id FROM employees c WHERE c.id = ${filter.after}::uuid)`;
    const rows = await this.db.$queryRaw<unknown[]>`
      SELECT e.id, e.employee_code, e.name_mm, e.name_en, e.photo_url, e.phone, e.status,
             u.status AS login_status, to_char(e.join_date, 'YYYY-MM-DD') AS join_date,
             coalesce((SELECT json_agg(json_build_object('id', b.id, 'code', b.code,
                         'name_mm', b.name_mm, 'name_en', b.name_en, 'phone', b.phone,
                         'status', b.status, 'is_public', b.is_public) ORDER BY b.code, b.id)
                       FROM branches b
                       WHERE b.id IN (SELECT eb.branch_id FROM employee_branches eb
                                      WHERE eb.employee_id = e.id
                                        AND eb.effective_from <= ${filter.today}::date
                                        AND coalesce(eb.effective_to, ${filter.today}::date)
                                            >= ${filter.today}::date)), '[]'::json) AS branches,
             coalesce((SELECT json_agg(json_build_object('id', r.id, 'name_mm', r.name_mm,
                         'name_en', r.name_en) ORDER BY r.name_mm, r.id)
                       FROM roles r
                       WHERE r.id IN (SELECT er.role_id FROM employee_roles er
                                      WHERE er.employee_id = e.id AND er.revoked_at IS NULL)),
                      '[]'::json) AS roles
      FROM employees e
      JOIN users u ON u.id = e.user_id
      WHERE ${this.visible(filter)} ${after}
      ORDER BY e.name_mm, e.id
      LIMIT ${filter.take}`;
    return rows.map((row) => rowSchema.parse(row));
  }
}
