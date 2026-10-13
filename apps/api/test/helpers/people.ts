import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { BranchStatus, EmployeeStatus, LoginMethod, UserStatus } from '@point/shared';

import type { PrismaService } from '../../src/common/database/prisma.service.js';

// Test data for the integration tests until the development seed exists (add-foundation-auth-access
// group 3). Every call makes new rows with unique values, so test files never collide and nothing
// has to be deleted (audit_events is append-only and point_app cannot clean it).

const unique = () => randomBytes(4).toString('hex');

export interface TestPerson {
  readonly userId: string;
  readonly employeeId: string;
  readonly sessionId: string;
  readonly email: string;
}

/** The company the test rows belong to: the first one, created when none exists. */
export async function testCompany(prisma: PrismaService): Promise<string> {
  const existing = await prisma.companies.findFirst({ select: { id: true } });
  if (existing !== null) return existing.id;
  const id = randomUUID();
  await prisma.companies.create({ data: { id, name_mm: 'Test company' } });
  return id;
}

export async function createBranch(prisma: PrismaService, companyId: string): Promise<string> {
  const id = randomUUID();
  const code = `T${unique()}`;
  await prisma.branches.create({
    data: { id, company_id: companyId, code, name_mm: code, status: BranchStatus.ACTIVE },
  });
  return id;
}

/** An ACTIVE user with an ACTIVE employee and one open session. */
export async function createPerson(
  prisma: PrismaService,
  companyId: string,
  options: { readonly branches?: readonly { id: string; from: string; to?: string }[] } = {},
): Promise<TestPerson> {
  const userId = randomUUID();
  const employeeId = randomUUID();
  const sessionId = randomUUID();
  const email = `t-${unique()}@point.test`;
  await prisma.users.create({ data: { id: userId, email, status: UserStatus.ACTIVE } });
  await prisma.employees.create({
    data: {
      id: employeeId,
      company_id: companyId,
      user_id: userId,
      employee_code: `T${unique()}`,
      name_mm: email,
      status: EmployeeStatus.ACTIVE,
    },
  });
  await prisma.user_sessions.create({
    data: {
      id: sessionId,
      user_id: userId,
      token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      login_method: LoginMethod.EMAIL_OTP,
    },
  });
  for (const branch of options.branches ?? []) {
    await prisma.employee_branches.create({
      data: {
        id: randomUUID(),
        employee_id: employeeId,
        branch_id: branch.id,
        effective_from: new Date(`${branch.from}T00:00:00Z`),
        effective_to: branch.to === undefined ? null : new Date(`${branch.to}T00:00:00Z`),
      },
    });
  }
  return { userId, employeeId, sessionId, email };
}
