import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';

// user_sessions (DB Part 1b — the auth module owns it). The look-up joins the user and the employee
// in one query, so the session guard's four checks of P1-RULE-04 cost one round trip.

export interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
  readonly revoked_at: Date | null;
  readonly revoke_reason: number | null;
}

/** A session with the status of its user and employee (no employee: the user has none). */
export interface ResolvedSession {
  readonly session: SessionRow;
  readonly userStatus: number;
  readonly employee: { readonly id: string; readonly status: number } | null;
}

export interface NewSession {
  readonly id: string;
  readonly user_id: string;
  readonly token_hash: string;
  readonly login_method: number;
  readonly device_label: string | null;
  readonly user_agent: string | null;
  readonly ip_address: string | null;
  readonly at: Date;
}

interface JoinedRow extends SessionRow {
  readonly user_status: number;
  readonly employee_id: string | null;
  readonly employee_status: number | null;
}

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Inside a TransactionRunner.run() the look-up sees that transaction's rows. */
  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  async insert(tx: Tx, row: NewSession): Promise<void> {
    await tx.user_sessions.create({
      data: {
        id: row.id,
        user_id: row.user_id,
        token_hash: row.token_hash,
        login_method: row.login_method,
        device_label: row.device_label,
        user_agent: row.user_agent,
        ip_address: row.ip_address,
        created_at: row.at,
        last_seen_at: row.at,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<ResolvedSession | null> {
    const rows = await this.db.$queryRaw<JoinedRow[]>`
      SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.revoked_at, s.revoke_reason,
             u.status AS user_status, e.id AS employee_id, e.status AS employee_status
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN employees e ON e.user_id = s.user_id
      WHERE s.token_hash = ${tokenHash}`;
    const [row] = rows;
    if (row === undefined) return null;
    return {
      session: {
        id: row.id,
        user_id: row.user_id,
        created_at: row.created_at,
        last_seen_at: row.last_seen_at,
        revoked_at: row.revoked_at,
        revoke_reason: row.revoke_reason,
      },
      userStatus: row.user_status,
      employee:
        row.employee_id === null || row.employee_status === null
          ? null
          : { id: row.employee_id, status: row.employee_status },
    };
  }

  /** The members of `/me.session`. */
  byId(id: string) {
    return this.db.user_sessions.findUnique({
      where: { id },
      select: { id: true, device_label: true, created_at: true },
    });
  }

  /** The user's sessions that are not revoked. */
  async activeIdsOfUser(tx: Tx, userId: string): Promise<string[]> {
    const rows = await tx.user_sessions.findMany({
      where: { user_id: userId, revoked_at: null },
      select: { id: true },
      orderBy: { created_at: 'asc' },
    });
    return rows.map((row) => row.id);
  }

  /** Sets the pair revoked_at / revoke_reason once; false when the session was already revoked. */
  async markRevoked(
    tx: Tx,
    id: string,
    revoke: { readonly at: Date; readonly reason: number; readonly byUserId: string | null },
  ): Promise<{ revoked: boolean; userId: string | null }> {
    const row = await tx.user_sessions.findUnique({ where: { id }, select: { user_id: true } });
    const { count } = await tx.user_sessions.updateMany({
      where: { id, revoked_at: null },
      data: {
        revoked_at: revoke.at,
        revoke_reason: revoke.reason,
        revoked_by_user_id: revoke.byUserId,
      },
    });
    return { revoked: count === 1, userId: row?.user_id ?? null };
  }

  /**
   * `last_seen_at = now` when it is not later than `notAfter` (design D6): one statement on the plain
   * connection — no business action, no audit; a lost race is harmless.
   */
  async touch(id: string, now: Date, notAfter: Date): Promise<void> {
    await this.prisma.user_sessions.updateMany({
      where: { id, last_seen_at: { lte: notAfter } },
      data: { last_seen_at: now },
    });
  }
}
