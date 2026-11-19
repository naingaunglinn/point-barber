import { Injectable } from '@nestjs/common';
import { EmployeeStatus, RevokeReason, UserStatus } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { DomainEvents } from '../../../common/events/domain-events.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { PeopleDirectory } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import {
  type ResolvedSession,
  type SessionRow,
  SessionRepository,
} from '../repositories/session.repository.js';
import { newSessionToken, sessionTokenHash } from './session-token.js';

// Sessions (API-AUTH-01 · ADR-005 · D-AUTH-06 · P1-RULE-04 / 15 · design D1 · D6). A session never
// expires on its own; it ends only by revocation. The service works inside the caller's transaction
// (sign-in, sign-out); the guard's per-request reads and the last-seen write need none.

export const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
export const REISSUE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export interface SessionMeta {
  readonly device_label?: string | null;
  readonly user_agent?: string | null;
  readonly ip?: string | null;
}

/** The P1-RULE-04 verdict on a resolved session. */
export type SessionState =
  | { readonly kind: 'valid'; readonly session: SessionRow; readonly employeeId: string }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'revoked'; readonly reason: RevokeReason };

/** Steps 2–4 of P1-RULE-04: the row, `revoked_at`, `users.status`, `employees.status`. */
export function sessionState(resolved: ResolvedSession | null): SessionState {
  if (resolved === null) return { kind: 'unknown' };
  const { session, employee } = resolved;
  if (session.revoked_at !== null) {
    return {
      kind: 'revoked',
      reason: (session.revoke_reason ?? RevokeReason.LOGOUT) as RevokeReason,
    };
  }
  if (
    resolved.userStatus !== UserStatus.ACTIVE ||
    employee === null ||
    employee.status !== EmployeeStatus.ACTIVE
  ) {
    return { kind: 'revoked', reason: RevokeReason.ACCOUNT_INACTIVE };
  }
  return { kind: 'valid', session, employeeId: employee.id };
}

/** `period(t) = floor((t − created_at) / 30 days)` (design D6). */
export const reissuePeriod = (createdAt: Date, at: Date): number =>
  Math.floor((at.getTime() - createdAt.getTime()) / REISSUE_PERIOD_MS);

@Injectable()
export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly clock: Clock,
    private readonly audit: Audit,
    private readonly events: DomainEvents,
    private readonly directory: PeopleDirectory,
  ) {}

  /**
   * A new session for a successful sign-in, inside the sign-in transaction. With `replacesToken` —
   * the `point_session` the request came with — that token's session is revoked with reason 1 when
   * it is still valid (P1-RULE-15); an unknown or already revoked token is ignored. The cookie value
   * is only looked up, never adopted (session fixation).
   */
  async create(
    tx: Tx,
    userId: string,
    loginMethod: number,
    meta: SessionMeta,
    options: { readonly replacesToken?: string } = {},
  ): Promise<{ readonly token: string; readonly sessionId: string }> {
    const at = this.clock.now();
    const token = newSessionToken();
    const sessionId = uuidV7(at.getTime());
    const deviceLabel = meta.device_label ?? null;
    await this.repository.insert(tx, {
      id: sessionId,
      user_id: userId,
      token_hash: sessionTokenHash(token),
      login_method: loginMethod,
      device_label: deviceLabel,
      user_agent: meta.user_agent ?? null,
      ip_address: meta.ip ?? null,
      at,
    });
    this.events.collect({
      name: 'auth.session_created',
      payload: {
        user_id: userId,
        session_id: sessionId,
        login_method: loginMethod,
        device_label: deviceLabel,
        at: at.toISOString(),
      },
    });
    if (options.replacesToken !== undefined) {
      const replaced = sessionState(await this.resolve(options.replacesToken));
      if (replaced.kind === 'valid') {
        await this.revoke(tx, replaced.session.id, RevokeReason.LOGOUT, userId, {
          actorSessionId: sessionId,
        });
      }
    }
    return { token, sessionId };
  }

  /** The session of a token with its user and employee — one query (P1-RULE-04). */
  resolve(token: string): Promise<ResolvedSession | null> {
    return this.repository.findByTokenHash(sessionTokenHash(token));
  }

  /**
   * Revokes one session: the pair `revoked_at` / `revoke_reason`, `revoked_by_user_id`, one
   * `session.revoked` audit row with the primary branch of the session's employee (design D12), and
   * `auth.session_revoked` after commit. A session already revoked keeps its first revocation.
   */
  async revoke(
    tx: Tx,
    sessionId: string,
    reason: RevokeReason,
    byUserId: string | null,
    options: { readonly actorSessionId?: string } = {},
  ): Promise<boolean> {
    const { revoked, userId } = await this.repository.markRevoked(tx, sessionId, {
      at: this.clock.now(),
      reason,
      byUserId,
    });
    if (!revoked || userId === null) return false;
    const employee = await this.directory.employeeOfUser(userId);
    const branchId = employee === null ? null : await this.directory.primaryBranchId(employee.id);
    const ctx = RequestContext.current();
    await this.audit.emit({
      action: 'session.revoked',
      entity_type: 'user_sessions',
      entity_id: sessionId,
      after: { revoke_reason: reason },
      branch_id: branchId,
      ...(ctx?.user_id === undefined
        ? { actor_user_id: byUserId, actor_session_id: options.actorSessionId ?? null }
        : {}),
    });
    this.events.collect({
      name: 'auth.session_revoked',
      payload: { user_id: userId, session_id: sessionId, revoke_reason: reason },
    });
    return true;
  }

  /** Every session of the user that is not revoked yet (employee deactivation, revoke-all). */
  async revokeAllForUser(
    tx: Tx,
    userId: string,
    reason: RevokeReason,
    byUserId: string | null,
  ): Promise<number> {
    let count = 0;
    for (const id of await this.repository.activeIdsOfUser(tx, userId)) {
      if (await this.revoke(tx, id, reason, byUserId)) count += 1;
    }
    return count;
  }

  /**
   * After a request passed the session check: `last_seen_at` is written at most once every five
   * minutes, and in each 30-day period from `created_at` the first request re-issues the cookie with
   * the same token (design D6). Returns whether to re-issue.
   */
  async seen(session: SessionRow, now: Date): Promise<boolean> {
    const reissue =
      reissuePeriod(session.created_at, now) >
      reissuePeriod(session.created_at, session.last_seen_at);
    const due = now.getTime() - session.last_seen_at.getTime() >= LAST_SEEN_THROTTLE_MS;
    if (reissue || due) {
      const notAfter = reissue ? now : new Date(now.getTime() - LAST_SEEN_THROTTLE_MS);
      await this.repository.touch(session.id, now, notAfter);
    }
    return reissue;
  }
}
