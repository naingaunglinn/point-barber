import { Injectable } from '@nestjs/common';
import { EmployeeStatus, type PilotData, ScopeType, UserStatus } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import {
  PilotRefused,
  type PilotRunContext,
  changedValue,
  dbDate,
} from '../../../common/pilot/pilot-run.js';
import { Audit, SettingsReader } from '../../platform/index.js';
import { CatalogueRepository } from '../repositories/catalogue.repository.js';
import { CompanyRepository } from '../repositories/company.repository.js';

// The `people` surface of the pilot data seed (add-pilot-data-seed design D3 / D4 / D5 · owner answer
// S16): the pilot branch, the people of the file as INVITED users with ACTIVE employees, their
// pilot-branch assignment and their branch-scope seed role. Additive only (PD3 ★): a missing row is
// written, an equal one left alone, a different stored value refused — nothing is ended, revoked or
// deactivated. No invite e-mail is sent (P1-RULE-02: the person signs in with Google). Deleted with the
// command when the real screens arrive (design D10).

/**
 * The Part 4 codes the "Seed" column of API Part 4 §9 names for each role the file may give — fixed
 * here, not read from the build's SeedRoles, so a later change that extends the seed roles cannot make
 * every re-run refuse (design D4.3).
 */
const SEED_ROLE_CODES = {
  Barber: ['sale.late_entry', 'sale.create'],
  Manager: [
    'visit.view',
    'visit.update',
    'visit.delete',
    'sale.view',
    'sale.create',
    'sale.delete',
    'sale.finish_override',
    'sale.override_price',
    'sale.late_entry',
    'payment.view',
    'payment.verify',
    'discount.view',
    'discount.approve',
  ],
} as const satisfies Record<PilotData['people'][number]['role'], readonly string[]>;

/** The lock of the code tables, taken first by every run (design D6). */
@Injectable()
export class PeopleSeedLock {
  constructor(private readonly catalogue: CatalogueRepository) {}

  take(tx: Tx): Promise<void> {
    return this.catalogue.lockCodeTables(tx);
  }
}

export interface PilotPeopleResult {
  readonly companyId: string;
  readonly branchId: string;
  /** Employee id by employee code, for every person of the file. */
  readonly employeeIds: ReadonlyMap<string, string>;
}

interface Found {
  readonly userId: string;
  readonly employeeId: string;
}

@Injectable()
export class PilotPeople {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly settings: SettingsReader,
    private readonly audit: Audit,
  ) {}

  /**
   * D4.2: a database the development fixture filled. Every fixture person is on `.test`; names and
   * codes are never compared — real people may be called Ko Aung, real codes may be E001.
   */
  async refuseFixture(tx: Tx): Promise<void> {
    const rows = await tx.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM users WHERE lower(email) LIKE '%.test'`;
    if (Number(rows[0]?.n ?? 0) > 0) {
      throw new PilotRefused([
        'users: the database holds .test addresses — it was filled by the development fixture (pnpm db:seed) and is not a pilot database (D-PLT-11)',
      ]);
    }
  }

  /** D4.3 (company row, seed roles) · D4.4 one branch · D4.5 identity. */
  async preflight(tx: Tx, data: PilotData): Promise<void> {
    const companyId = await this.companies.companyId(tx);
    if (companyId === null) {
      throw new PilotRefused(['companies: no company row — start the API once first (base seed)']);
    }
    const problems: string[] = [];

    for (const name of new Set(data.people.map((person) => person.role))) {
      const role = await this.seedRole(tx, name);
      if (role === null) {
        problems.push(`roles: no active role named ${name} — start the API once first (base seed)`);
        continue;
      }
      const missing = SEED_ROLE_CODES[name].filter((code) => !role.codes.has(code));
      if (missing.length > 0) {
        problems.push(
          `roles: the ${name} role lacks ${missing.join(', ')} (API Part 4 §9 seed) — the build that started this database is older than add-walkin-visit-checkout`,
        );
      }
    }
    if (problems.length > 0) throw new PilotRefused(problems);

    const others = await tx.branches.findMany({
      where: { company_id: companyId, code: { not: data.branch.code } },
      select: { code: true },
    });
    if (others.length > 0) {
      throw new PilotRefused([
        `branches: the company holds ${others.map((b) => b.code).join(', ')} — the pilot database holds exactly one branch, ${data.branch.code}`,
      ]);
    }

    for (const [index, person] of data.people.entries()) {
      const problem = await this.identityProblem(tx, companyId, person);
      if (problem !== null) problems.push(`people[${index}]: ${problem}`);
    }
    if (problems.length > 0) throw new PilotRefused(problems);
  }

  async apply(tx: Tx, data: PilotData, ctx: PilotRunContext): Promise<PilotPeopleResult> {
    const companyId = await this.companies.companyId(tx);
    if (companyId === null) throw new PilotRefused(['companies: no company row']);

    // First pass: every stored value that differs from the file, before anything is written (D4.6).
    const branch = await tx.branches.findFirst({
      where: { company_id: companyId, code: data.branch.code },
    });
    const problems: string[] = [];
    if (branch !== null) {
      for (const column of ['name_mm', 'name_en', 'phone', 'address_mm', 'address_en'] as const) {
        const file = data.branch[column] ?? null;
        if (branch[column] !== file) {
          problems.push(changedValue('branches', data.branch.code, column, branch[column], file));
        }
      }
    }
    const found = new Map<string, Found>();
    for (const person of data.people) {
      const employee = await tx.employees.findFirst({
        where: { company_id: companyId, employee_code: person.employee_code },
        select: { id: true, user_id: true, name_mm: true, name_en: true, join_date: true },
      });
      if (employee === null) continue;
      found.set(person.employee_code, { userId: employee.user_id, employeeId: employee.id });
      const key = person.employee_code;
      if (employee.name_mm !== person.name_mm) {
        problems.push(changedValue('employees', key, 'name_mm', employee.name_mm, person.name_mm));
      }
      // The optional values are compared only when the file gives them.
      if (person.name_en !== undefined && employee.name_en !== person.name_en) {
        problems.push(changedValue('employees', key, 'name_en', employee.name_en, person.name_en));
      }
      const joined = employee.join_date?.toISOString().slice(0, 10) ?? null;
      if (person.join_date !== undefined && joined !== person.join_date) {
        problems.push(changedValue('employees', key, 'join_date', joined, person.join_date));
      }
    }
    if (problems.length > 0) throw new PilotRefused(problems);

    // Second pass: the writes, in the order of design D6.
    const branchId = branch?.id ?? (await this.createBranch(tx, companyId, data, ctx));
    if (branch !== null) ctx.plan.unchanged('branches');

    const roles = new Map<string, string>();
    for (const name of new Set(data.people.map((person) => person.role))) {
      const role = await this.seedRole(tx, name);
      if (role === null) throw new PilotRefused([`roles: no active role named ${name}`]);
      roles.set(name, role.id);
    }

    const employeeIds = new Map<string, string>();
    for (const person of data.people) {
      const known = found.get(person.employee_code);
      const employeeId =
        known?.employeeId ?? (await this.createPerson(tx, companyId, branchId, person, ctx));
      if (known !== undefined) {
        ctx.plan.unchanged('users');
        ctx.plan.unchanged('employees');
      }
      employeeIds.set(person.employee_code, employeeId);
      await this.assignBranch(tx, employeeId, branchId, ctx);
      await this.assignRole(tx, employeeId, roles.get(person.role) ?? '', branchId, ctx);
    }
    return { companyId, branchId, employeeIds };
  }

  private async seedRole(
    tx: Tx,
    nameEn: string,
  ): Promise<{ id: string; codes: Set<string> } | null> {
    const role = await tx.roles.findFirst({
      where: { name_en: nameEn, archived_at: null, status: 1 },
      orderBy: { created_at: 'asc' },
      select: {
        id: true,
        role_permissions: {
          select: { permissions: { select: { code: true, archived_at: true } } },
        },
      },
    });
    if (role === null) return null;
    return {
      id: role.id,
      codes: new Set(
        role.role_permissions
          .filter((link) => link.permissions.archived_at === null)
          .map((link) => link.permissions.code),
      ),
    };
  }

  /** null when the address and the code are both new or both belong to the same employee (D4.5). */
  private async identityProblem(
    tx: Tx,
    companyId: string,
    person: PilotData['people'][number],
  ): Promise<string | null> {
    const users = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = lower(${person.email})`;
    const userId = users[0]?.id ?? null;
    const employee = await tx.employees.findFirst({
      where: { company_id: companyId, employee_code: person.employee_code },
      select: { user_id: true },
    });
    if (userId === null && employee === null) return null;
    if (userId !== null && employee !== null && employee.user_id === userId) return null;
    if (employee === null) {
      return `${person.email} belongs to an existing user with another employee code than ${person.employee_code}`;
    }
    return `employee code ${person.employee_code} belongs to an existing employee with another address than ${person.email}`;
  }

  private async createBranch(
    tx: Tx,
    companyId: string,
    data: PilotData,
    ctx: PilotRunContext,
  ): Promise<string> {
    const { 'attendance.default_radius_meters': radius } = await this.settings.effective([
      'attendance.default_radius_meters',
    ]);
    const row = {
      id: uuidV7(ctx.now.getTime()),
      company_id: companyId,
      code: data.branch.code,
      name_mm: data.branch.name_mm,
      name_en: data.branch.name_en ?? null,
      phone: data.branch.phone ?? null,
      address_mm: data.branch.address_mm ?? null,
      address_en: data.branch.address_en ?? null,
      location_radius_meters: radius,
      status: 1,
    };
    await tx.branches.create({ data: { ...row, created_at: ctx.now, updated_at: ctx.now } });
    ctx.plan.created('branches');
    const { id, company_id: _company, ...after } = row;
    this.audit.emitSystem({
      action: 'branch.create',
      entity_type: 'branches',
      entity_id: id,
      branch_id: id,
      after: { ...after, operator: ctx.operator },
    });
    return id;
  }

  /** An INVITED user and its ACTIVE employee — no invite e-mail (P1-RULE-02 · D-ARC-02). */
  private async createPerson(
    tx: Tx,
    companyId: string,
    branchId: string,
    person: PilotData['people'][number],
    ctx: PilotRunContext,
  ): Promise<string> {
    const userId = uuidV7(ctx.now.getTime());
    const employeeId = uuidV7(ctx.now.getTime());
    await tx.users.create({
      data: {
        id: userId,
        email: person.email,
        status: UserStatus.INVITED,
        invited_at: ctx.now,
        created_at: ctx.now,
        updated_at: ctx.now,
      },
    });
    await tx.employees.create({
      data: {
        id: employeeId,
        company_id: companyId,
        user_id: userId,
        employee_code: person.employee_code,
        name_mm: person.name_mm,
        name_en: person.name_en ?? null,
        join_date: person.join_date === undefined ? null : dbDate(person.join_date),
        status: EmployeeStatus.ACTIVE,
        created_at: ctx.now,
        updated_at: ctx.now,
      },
    });
    ctx.plan.created('users');
    ctx.plan.created('employees');
    this.audit.emitSystem({
      action: 'employee.create',
      entity_type: 'employees',
      entity_id: employeeId,
      branch_id: branchId,
      after: {
        employee_code: person.employee_code,
        email: person.email,
        name_mm: person.name_mm,
        name_en: person.name_en ?? null,
        join_date: person.join_date ?? null,
        user_status: UserStatus.INVITED,
        operator: ctx.operator,
      },
    });
    return employeeId;
  }

  /** The open pilot-branch assignment, from the run's business date (D-EMP-01 · design D7). */
  private async assignBranch(
    tx: Tx,
    employeeId: string,
    branchId: string,
    ctx: PilotRunContext,
  ): Promise<void> {
    const open = await tx.employee_branches.findFirst({
      where: { employee_id: employeeId, branch_id: branchId, effective_to: null },
      select: { id: true },
    });
    if (open !== null) {
      ctx.plan.unchanged('employee_branches');
      return;
    }
    const id = uuidV7(ctx.now.getTime());
    await tx.employee_branches.create({
      data: {
        id,
        employee_id: employeeId,
        branch_id: branchId,
        effective_from: dbDate(ctx.businessDate),
        created_at: ctx.now,
        updated_at: ctx.now,
      },
    });
    ctx.plan.created('employee_branches');
    this.audit.emitSystem({
      action: 'employee.branch_assign',
      entity_type: 'employee_branches',
      entity_id: id,
      branch_id: branchId,
      after: {
        employee_id: employeeId,
        branch_id: branchId,
        effective_from: ctx.businessDate,
        operator: ctx.operator,
      },
    });
  }

  /**
   * The seed role at branch scope for the pilot branch (D-ROLE-04 / 05 · PD4 ★). An active assignment
   * of that role is kept: at company scope it covers the branch already; at branch scope it gets the
   * pilot branch row when it lacks one.
   */
  private async assignRole(
    tx: Tx,
    employeeId: string,
    roleId: string,
    branchId: string,
    ctx: PilotRunContext,
  ): Promise<void> {
    const active = await tx.employee_roles.findFirst({
      where: { employee_id: employeeId, role_id: roleId, revoked_at: null },
      select: {
        id: true,
        scope_type: true,
        employee_role_branches: { select: { branch_id: true } },
      },
    });
    if (
      active !== null &&
      (active.scope_type === ScopeType.COMPANY ||
        active.employee_role_branches.some((row) => row.branch_id === branchId))
    ) {
      ctx.plan.unchanged('employee_roles');
      if (active.scope_type !== ScopeType.COMPANY) ctx.plan.unchanged('employee_role_branches');
      return;
    }
    const assignmentId = active?.id ?? uuidV7(ctx.now.getTime());
    if (active === null) {
      await tx.employee_roles.create({
        data: {
          id: assignmentId,
          employee_id: employeeId,
          role_id: roleId,
          scope_type: ScopeType.BRANCHES,
          assigned_at: ctx.now,
          created_at: ctx.now,
          updated_at: ctx.now,
        },
      });
      ctx.plan.created('employee_roles');
    } else {
      ctx.plan.unchanged('employee_roles');
    }
    await tx.employee_role_branches.create({
      data: {
        id: uuidV7(ctx.now.getTime()),
        employee_role_id: assignmentId,
        branch_id: branchId,
        created_at: ctx.now,
      },
    });
    ctx.plan.created('employee_role_branches');
    this.audit.emitSystem({
      action: 'employee.role_assign',
      entity_type: 'employee_roles',
      entity_id: assignmentId,
      branch_id: branchId,
      after: {
        employee_id: employeeId,
        role_id: roleId,
        scope_type: ScopeType.BRANCHES,
        branch_ids: [branchId],
        operator: ctx.operator,
      },
    });
  }
}
