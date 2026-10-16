import { Controller, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  type MeResponse,
  type OtpRequest,
  type OtpVerify,
  RevokeReason,
  otpRequestSchema,
  otpVerifySchema,
} from '@point/shared';
import type { Request, Response } from 'express';

import { Self } from '../../common/access/declarations.js';
import { Public } from '../../common/access/public.decorator.js';
import { AppConfig } from '../../common/config/config.js';
import { TransactionRunner } from '../../common/database/transaction-runner.js';
import { ZBody } from '../../common/http/zod-validation.pipe.js';
import { Audit, Audited } from '../platform/index.js';
import { caller } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { OtpService, RESEND_AFTER_SECONDS } from './otp/otp.service.js';
import {
  SESSION_COOKIE,
  clearedSessionCookie,
  readCookie,
  sessionCookie,
} from './session/session-cookie.js';
import { SessionService } from './session/session.service.js';
import { rateLimited, toProblem } from './sign-in/outcome.js';
import { requestMeta } from './sign-in/sign-in.service.js';

// P1.AUTH.01 / 02 / 05 (design D4 · D6 · D12). The controller validates, calls one service method
// and maps a refused outcome with toProblem(); it makes no business decision (CG-API-01).
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly me: MeService,
    private readonly sessions: SessionService,
    private readonly runner: TransactionRunner,
    private readonly audit: Audit,
    private readonly config: AppConfig,
  ) {}

  /** P1.AUTH.01 — the same 202 for every address (P1-RULE-02). */
  @Post('otp/request')
  @HttpCode(202)
  @Public()
  request(@ZBody(otpRequestSchema) body: OtpRequest): { resend_after_seconds: number } {
    const result = this.otp.request(body.email, requestMeta());
    if (!result.accepted) throw rateLimited(result.retryAfter);
    return { resend_after_seconds: RESEND_AFTER_SECONDS };
  }

  /** P1.AUTH.02 — a session and the `/me` body, or one of the refusals of P1-RULE-03. */
  @Post('otp/verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Public()
  @Audited({ actions: ['login.success', 'login.failed', 'login.locked', 'session.revoked'] })
  async verify(
    @ZBody(otpVerifySchema) body: OtpVerify,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeResponse> {
    const replacesToken = readCookie(req.header('cookie'), SESSION_COOKIE);
    const outcome = await this.otp.verify(
      body.email,
      body.code,
      requestMeta({
        ...(body.device_label === undefined ? {} : { deviceLabel: body.device_label }),
        ...(replacesToken === undefined ? {} : { replacesToken }),
      }),
    );
    if (outcome.kind !== 'ok') throw toProblem(outcome);
    res.append('Set-Cookie', sessionCookie(outcome.token, this.config.env.SESSION_COOKIE_SECURE));
    return this.me.build(outcome.userId, outcome.sessionId);
  }

  /** P1.AUTH.05 — the current session only; the caller's other sessions stay. */
  @Post('logout')
  @HttpCode(204)
  @Self()
  @Audited({ actions: ['session.revoked'], target: 'employee' })
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    const { userId, sessionId } = caller();
    await this.runner.run(async (tx) => {
      // A session revoked by a parallel request in the meantime keeps its first revocation.
      if (!(await this.sessions.revoke(tx, sessionId, RevokeReason.LOGOUT, userId))) {
        this.audit.skip();
      }
    });
    res.append('Set-Cookie', clearedSessionCookie(this.config.env.SESSION_COOKIE_SECURE));
  }
}
