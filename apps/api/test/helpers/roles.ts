import { randomBytes, randomUUID } from 'node:crypto';

import { ScopeType } from '@point/shared';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// A role with the given codes, assigned to one employee — the "the integration test creates the role
// … and assigns it" steps of the access scenarios. The role name is made unique per call.

export interface Assignment {
  readonly roleId: string;
  readonly assignmentId: string;
}

export async function assignRole(
  prisma: PrismaService,
  options: {
    readonly name: string;
    readonly employeeId: string;
    readonly codes: readonly string[];
    readonly scope: ScopeType;
    readonly branchIds?: readonly string[];
  },
): Promise<Assignment> {
  const employee = await prisma.employees.findUniqueOrThrow({
    where: { id: options.employeeId },
    select: { company_id: true },
  });
  const permissions = await prisma.permissions.findMany({
    where: { code: { in: [...options.codes] } },
    select: { id: true, code: true },
  });
  if (permissions.length !== options.codes.length) {
    throw new Error(`assignRole: unknown code among ${options.codes.join(', ')}`);
  }
  const roleId = randomUUID();
  const assignmentId = randomUUID();
  const name = `${options.name} ${randomBytes(3).toString('hex')}`;
  await prisma.roles.create({
    data: { id: roleId, company_id: employee.company_id, name_mm: name, name_en: name },
  });
  await prisma.role_permissions.createMany({
    data: permissions.map((permission) => ({
      id: randomUUID(),
      role_id: roleId,
      permission_id: permission.id,
    })),
  });
  await prisma.employee_roles.create({
    data: {
      id: assignmentId,
      employee_id: options.employeeId,
      role_id: roleId,
      scope_type: options.scope,
      assigned_at: new Date(),
    },
  });
  if (options.scope === ScopeType.BRANCHES) {
    await prisma.employee_role_branches.createMany({
      data: (options.branchIds ?? []).map((branchId) => ({
        id: randomUUID(),
        employee_role_id: assignmentId,
        branch_id: branchId,
      })),
    });
  }
  return { roleId, assignmentId };
}
