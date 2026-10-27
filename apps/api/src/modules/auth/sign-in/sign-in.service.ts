import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { EmployeeStatus, LoginMethod, UserStatus, toMmtIso } from '@point/shared';

import { AppConfig } from '../../../common/config/config.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { PeopleDirectory } from '../../people/index.js';
import { Audit } from '../../platform/index.js';
import { type LoginUser, LoginRepository } from '../repositories/login.repository.js';
import { SessionService } from '../session/session.service.js';
import { deviceLabel } from './device-label.js';

// What both sign-in methods share (P1-RULE-02 / 10 / 15 · design D4 · D6 · D7 · D12): who may sign
// in, the success step — activation, counter reset, last-login time, the session (replacing the one
// the browser held) and the `login.success` row — and the `login.failed` row with the address only as
// a hash.

export type SignInMethod = 'otp' | 'google';

export interface SignInMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly client: string | null;
  readonly deviceLabel?: string;
  /** The `point_session` value the request came with (P1-RULE-15). */
  readonly replacesToken?: string;
}

/** The meta of the current request, from the request context. */
export function requestMeta(
  extra: { deviceLabel?: string; replacesToken?: string } = {},
): SignInMeta {
  const ctx = RequestContext.current();
  return {
    ip: ctx?.ip ?? null,
    userAgent: ctx?.user_agent ?? null,
    client: ctx?.client ?? null,
    ...extra,
  };
}

@Injectable()
export class SignInService {
  constructor(
    private readonly logins: LoginRepository,
    private readonly sessions: SessionService,
    private readonly directory: PeopleDirectory,
    private readonly audit: Audit,
    private readonly config: AppConfig,
  ) {}

  /** `hex(HMAC-SHA256(AUDIT_HASH_SECRET, lower(email)))` — the address as `login.failed` keeps it. */
  emailHash(email: string): string {
    return createHmac('sha256', this.config.env.AUDIT_HASH_SECRET)
      .update(email.toLowerCase(), 'utf8')
      .digest('hex');
  }

  /** Users 1 ACTIVE or 2 INVITED whose employee is 1 ACTIVE may sign in (P1-RULE-02). */
  async eligible(user: LoginUser | null): Promise<boolean> {
    if (user === null) return false;
    if (user.status !== UserStatus.ACTIVE && user.status !== UserStatus.INVITED) return false;
    const employee = await this.directory.employeeOfUser(user.id);
    return employee?.status === EmployeeStatus.ACTIVE;
  }

  /**
   * The success step, inside the sign-in transaction after the user row was locked: an INVITED user
   * becomes ACTIVE with `activated_at`; the counter is reset; the session is created (revoking the
   * still-valid session of the request's cookie); `login.success` names the new session.
   */
  async succeed(
    tx: Tx,
    user: { readonly id: string; readonly status: number },
    method: SignInMethod,
    at: Date,
    meta: SignInMeta,
    options: { readonly googleSubject?: string } = {},
  ): Promise<{ readonly sessionId: string; readonly token: string }> {
    await this.logins.recordSuccess(tx, user.id, at, {
      activate: user.status === UserStatus.INVITED,
      resetFailures: method === 'otp',
      ...options,
    });
    const label = deviceLabel(
      meta.deviceLabel,
      meta.userAgent ?? undefined,
      meta.client ?? undefined,
    );
    const session = await this.sessions.create(
      tx,
      user.id,
      method === 'otp' ? LoginMethod.EMAIL_OTP : LoginMethod.GOOGLE,
      { device_label: label, user_agent: meta.userAgent, ip: meta.ip },
      meta.replacesToken === undefined ? {} : { replacesToken: meta.replacesToken },
    );
    await this.audit.emit({
      action: 'login.success',
      entity_type: 'users',
      entity_id: user.id,
      after: { method, device_label: label },
      actor_user_id: user.id,
      actor_session_id: session.sessionId,
    });
    return session;
  }

  /** `login.locked` — the fifth failure in a row set the lock (P1-RULE-03 · design D12). */
  async locked(userId: string, until: Date, meta: SignInMeta): Promise<void> {
    await this.audit.emit({
      action: 'login.locked',
      entity_type: 'users',
      entity_id: userId,
      after: { until: toMmtIso(until), ip: meta.ip },
    });
  }

  /** `login.failed` (design D12): the address only as a hash, the client IP and the cause. */
  async failed(
    method: SignInMethod,
    userId: string | null,
    email: string | null,
    meta: SignInMeta,
    cause: string,
  ): Promise<void> {
    await this.audit.emit({
      action: 'login.failed',
      entity_type: 'users',
      entity_id: userId,
      after: {
        method,
        email_hash: email === null ? null : this.emailHash(email),
        ip: meta.ip,
        cause,
      },
    });
  }
}
