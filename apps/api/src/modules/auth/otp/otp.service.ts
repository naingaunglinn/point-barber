import { Injectable } from '@nestjs/common';
import { UiLanguage } from '@point/shared';

import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { BackgroundTasks } from '../../../common/http/background-tasks.js';
import { uuidV7 } from '../../../common/http/uuid-v7.js';
import { Mail, RateLimiter } from '../../platform/index.js';
import { LoginRepository } from '../repositories/login.repository.js';
import type { SignInOutcome } from '../sign-in/outcome.js';
import { type SignInMeta, SignInService } from '../sign-in/sign-in.service.js';
import { OTP_VALID_MS, codeAccepted, newOtpCode, otpHash } from './otp-code.js';

// The e-mail code (P1.AUTH.01 / 02 · P1-RULE-02 / 03 · API-LIM-02 · design D4 · D5 · D12).

export const RESEND_AFTER_SECONDS = 60;
export const OTP_TEMPLATE = 'auth.email.otp';
const LOCK_AFTER = 5;
const LOCK_MS = 20 * 60 * 1000;
const HOUR = 3600;

type Refused = { readonly accepted: false; readonly retryAfter: number };

@Injectable()
export class OtpService {
  constructor(
    private readonly logins: LoginRepository,
    private readonly signIn: SignInService,
    private readonly runner: TransactionRunner,
    private readonly background: BackgroundTasks,
    private readonly limiter: RateLimiter,
    private readonly mail: Mail,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  /**
   * P1.AUTH.01. The two limits (`otp:ip` 10 per hour, then `otp:email` 1 per 60 s — applied to every
   * address alike), then the answer: the issuing work starts in the background and is not awaited,
   * so the response time is the same for every address (design D4).
   */
  request(email: string, meta: SignInMeta): { readonly accepted: true } | Refused {
    const limit = this.limiter.hitAll([
      { bucket: 'otp:ip', key: meta.ip ?? 'unknown', limit: 10, windowSeconds: HOUR },
      {
        bucket: 'otp:email',
        // The address's HMAC, so the store holds no address (design D5).
        key: this.signIn.emailHash(email),
        limit: 1,
        windowSeconds: RESEND_AFTER_SECONDS,
      },
    ]);
    if (!limit.allowed) return { accepted: false, retryAfter: limit.retryAfter };
    this.background.run(() => this.issue(email, meta.ip));
    return { accepted: true };
  }

  /** The issuing work: the same call for every address; only an eligible one gets a code. */
  private async issue(email: string, ip: string | null): Promise<void> {
    const user = await this.logins.userByEmail(email);
    if (user === null || !(await this.signIn.eligible(user))) return;
    await this.runner.run(async (tx) => {
      await this.logins.lockUser(tx, user.id);
      const at = this.clock.now();
      const code = newOtpCode();
      const expiresAt = new Date(at.getTime() + OTP_VALID_MS);
      await this.logins.consumeOpenCodes(tx, user.id, at);
      await this.logins.insertCode(tx, {
        id: uuidV7(at.getTime()),
        user_id: user.id,
        code_hash: otpHash(this.config.env.OTP_HMAC_SECRET, user.id, code),
        created_at: at,
        expires_at: expiresAt,
        request_ip: ip,
      });
      const locale =
        user.ui_language === UiLanguage.EN
          ? 'en'
          : user.ui_language === UiLanguage.MY
            ? 'my'
            : null;
      await this.mail.enqueue(tx, OTP_TEMPLATE, user.email, { code }, { expiresAt, locale });
    });
  }

  /**
   * P1.AUTH.02. The per-IP cap first, before any look-up (API-LIM-02 v1.6); then one transaction:
   * lock the user → a running lock answers `locked` without looking at the code → the newest code
   * decides. Every failure is counted and audited; the fifth in a row locks for 20 minutes. The
   * outcome is returned after commit, so a refusal keeps what it recorded (design D3).
   */
  async verify(email: string, code: string, meta: SignInMeta): Promise<SignInOutcome> {
    const cap = this.limiter.hitAll([
      { bucket: 'otp_verify:ip', key: meta.ip ?? 'unknown', limit: 10, windowSeconds: HOUR },
    ]);
    if (!cap.allowed) return { kind: 'rate_limited', retryAfter: cap.retryAfter };

    const secret = this.config.env.OTP_HMAC_SECRET;
    const user = await this.logins.userByEmail(email);
    if (user === null || !(await this.signIn.eligible(user))) {
      // The same work as for a real check, so the answer time does not tell the cases apart.
      otpHash(secret, user?.id ?? '00000000-0000-0000-0000-000000000000', code);
      await this.runner.run(() =>
        this.signIn.failed(
          'otp',
          user?.id ?? null,
          email,
          meta,
          user === null ? 'unknown_email' : 'ineligible',
        ),
      );
      return { kind: 'invalid' };
    }

    return this.runner.run(async (tx): Promise<SignInOutcome> => {
      const locked = await this.logins.lockUser(tx, user.id);
      if (locked === null) return { kind: 'invalid' };
      const at = this.clock.now();
      if (locked.login_locked_until !== null && at < locked.login_locked_until) {
        await this.signIn.failed('otp', user.id, email, meta, 'locked');
        return { kind: 'locked', until: locked.login_locked_until };
      }
      const newest = await this.logins.newestCode(tx, user.id);
      if (newest !== null && codeAccepted(newest, otpHash(secret, user.id, code), at)) {
        await this.logins.consumeCode(tx, newest.id, at);
        const session = await this.signIn.succeed(tx, locked, 'otp', at, meta);
        return { kind: 'ok', userId: user.id, ...session };
      }
      const cause =
        newest === null || newest.consumed_at !== null
          ? 'no_code'
          : at >= newest.expires_at
            ? 'expired'
            : 'wrong_code';
      const count = locked.failed_login_count + 1;
      const until = count >= LOCK_AFTER ? new Date(at.getTime() + LOCK_MS) : null;
      await this.logins.recordFailure(tx, user.id, count, until, at);
      await this.signIn.failed('otp', user.id, email, meta, cause);
      if (until === null) return { kind: 'invalid' };
      await this.signIn.locked(user.id, until, meta);
      return { kind: 'locked', until };
    });
  }
}
