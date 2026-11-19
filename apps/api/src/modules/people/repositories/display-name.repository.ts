import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// The names the API shows for people (ADR-001 rule 1 — the people module owns users and employees).
// Inside a TransactionRunner.run() a read goes through that transaction.

export interface PersonName {
  readonly name_mm: string;
  readonly name_en: string | null;
}

@Injectable()
export class DisplayNameRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** `users.ui_language` of one user; null = the system default (AD-L10N-06). */
  async uiLanguage(userId: string): Promise<number | null> {
    const row = await this.db.users.findUnique({
      where: { id: userId },
      select: { ui_language: true },
    });
    return row?.ui_language ?? null;
  }

  /** The employee names of users, keyed by user id. */
  async namesOfUsers(userIds: readonly string[]): Promise<Map<string, PersonName>> {
    const rows = await this.db.employees.findMany({
      where: { user_id: { in: [...userIds] } },
      select: { user_id: true, name_mm: true, name_en: true },
    });
    return new Map(rows.map(({ user_id, ...name }) => [user_id, name]));
  }

  /** The names of employees, keyed by employee id. */
  async namesOfEmployees(employeeIds: readonly string[]): Promise<Map<string, PersonName>> {
    const rows = await this.db.employees.findMany({
      where: { id: { in: [...employeeIds] } },
      select: { id: true, name_mm: true, name_en: true },
    });
    return new Map(rows.map(({ id, ...name }) => [id, name]));
  }
}
