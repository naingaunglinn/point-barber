import { Injectable } from '@nestjs/common';
import { UserStatus } from '@point/shared';

import { PrismaService } from '../../../common/database/prisma.service.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { TransactionScope } from '../../../common/database/transaction-scope.js';
import type { OtpRow } from '../otp/otp-code.js';

// The login columns of `users` and the table `login_otps` (DB Part 1 / 1b — the auth module owns
// them). Row locks in the order of design D1: `users` → `login_otps` → `user_sessions`.

export interface LoginUser {
  readonly id: string;
  readonly email: string;
  readonly status: number;
  readonly ui_language: number | null;
  readonly google_subject: string | null;
}

export interface LockedUser {
  readonly id: string;
  readonly status: number;
  readonly failed_login_count: number;
  readonly login_locked_until: Date | null;
}

const USER_SELECT = {
  id: true,
  email: true,
  status: true,
  ui_language: true,
  google_subject: true,
} as const;

@Injectable()
export class LoginRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return TransactionScope.current()?.tx ?? this.prisma;
  }

  /** The user of an address, compared in lower case. */
  userByEmail(email: string): Promise<LoginUser | null> {
    return this.db.users.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: USER_SELECT,
    });
  }

  userByGoogleSubject(subject: string): Promise<LoginUser | null> {
    return this.db.users.findUnique({ where: { google_subject: subject }, select: USER_SELECT });
  }

  userById(id: string) {
    return this.db.users.findUnique({
      where: { id },
      select: { ...USER_SELECT, last_login_at: true },
    });
  }

  /** `SELECT … FOR UPDATE` on the user row — the first lock of every sign-in transaction. */
  async lockUser(tx: Tx, userId: string): Promise<LockedUser | null> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT id, status, failed_login_count, login_locked_until
      FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /** "Older rows are invalidated" (P1-RULE-03): every unconsumed code of the user is used up. */
  async consumeOpenCodes(tx: Tx, userId: string, at: Date): Promise<void> {
    await tx.login_otps.updateMany({
      where: { user_id: userId, consumed_at: null },
      data: { consumed_at: at },
    });
  }

  async insertCode(
    tx: Tx,
    row: {
      readonly id: string;
      readonly user_id: string;
      readonly code_hash: string;
      readonly created_at: Date;
      readonly expires_at: Date;
      readonly request_ip: string | null;
    },
  ): Promise<void> {
    await tx.login_otps.create({ data: row });
  }

  /** The newest code of the user, locked — only it counts (P1-RULE-03). */
  async newestCode(tx: Tx, userId: string): Promise<OtpRow | null> {
    const rows = await tx.$queryRaw<OtpRow[]>`
      SELECT id, code_hash, expires_at, consumed_at FROM login_otps
      WHERE user_id = ${userId}::uuid
      ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`;
    return rows[0] ?? null;
  }

  async consumeCode(tx: Tx, id: string, at: Date): Promise<void> {
    await tx.login_otps.update({ where: { id }, data: { consumed_at: at } });
  }

  async recordFailure(tx: Tx, userId: string, count: number, lockedUntil: Date | null, at: Date) {
    await tx.users.update({
      where: { id: userId },
      data: {
        failed_login_count: count,
        ...(lockedUntil === null ? {} : { login_locked_until: lockedUntil }),
        updated_at: at,
      },
    });
  }

  /**
   * A successful sign-in (P1-RULE-02 / 03): the counter back to 0, `last_login_at`, and for an
   * INVITED user `status = 1` and `activated_at` — set once, never changed afterwards.
   */
  async recordSuccess(
    tx: Tx,
    userId: string,
    at: Date,
    options: { readonly activate: boolean; readonly googleSubject?: string },
  ): Promise<void> {
    await tx.users.update({
      where: { id: userId },
      data: {
        failed_login_count: 0,
        last_login_at: at,
        updated_at: at,
        ...(options.activate ? { status: UserStatus.ACTIVE, activated_at: at } : {}),
        ...(options.googleSubject === undefined ? {} : { google_subject: options.googleSubject }),
      },
    });
  }

  async setUiLanguage(tx: Tx, userId: string, uiLanguage: number | null, at: Date) {
    await tx.users.update({
      where: { id: userId },
      data: { ui_language: uiLanguage, updated_at: at },
    });
  }

  /** `auth.cleanup` (ADR-002): codes past their expiry are deleted; returns how many. */
  async deleteExpiredCodes(now: Date): Promise<number> {
    const { count } = await this.prisma.login_otps.deleteMany({
      where: { expires_at: { lt: now } },
    });
    return count;
  }
}
