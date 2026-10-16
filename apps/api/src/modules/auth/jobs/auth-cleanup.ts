import { Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock/clock.js';
import { LoginRepository } from '../repositories/login.repository.js';

// `auth.cleanup` (ADR-002 · design D9): hourly, deletes the `login_otps` rows past their expiry. A
// code is useless after `expires_at`; a verify with an already deleted code answers `otp_invalid`
// like any other failure (proposal → Recorded readings 6). Not a transactional row: no audit.

export const AUTH_CLEANUP = 'auth.cleanup';
/** At minute 0 of every hour. */
export const AUTH_CLEANUP_CRON = '0 * * * *';

@Injectable()
export class AuthCleanup {
  constructor(
    private readonly logins: LoginRepository,
    private readonly clock: Clock,
  ) {}

  /** Returns how many codes were deleted. */
  run(): Promise<number> {
    return this.logins.deleteExpiredCodes(this.clock.now());
  }
}
