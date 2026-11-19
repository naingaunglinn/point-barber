import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { type GoogleStartQuery, googleStartQuerySchema } from '@point/shared';
import type { Request, Response } from 'express';

import { Public } from '../../../common/access/public.decorator.js';
import { AppConfig } from '../../../common/config/config.js';
import { ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { SESSION_COOKIE, readCookie, sessionCookie } from '../session/session-cookie.js';
import { requestMeta } from '../sign-in/sign-in.service.js';
import { GoogleSignIn, STATE_COOKIE, STATE_COOKIE_PATH } from './google.service.js';

// P1.AUTH.03 / 04 (design D7): two GET routes of the browser flow, so the CSRF rule does not apply.
// The state cookie lives 10 minutes on the Google paths only and is cleared by every callback.

const stateCookie = (value: string, maxAge: number, secure: boolean): string =>
  [
    `${STATE_COOKIE}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=${STATE_COOKIE_PATH}`,
    'HttpOnly',
    ...(secure ? ['Secure'] : []),
    'SameSite=Lax',
  ].join('; ');

@Controller('v1/auth/google')
export class GoogleController {
  constructor(
    private readonly google: GoogleSignIn,
    private readonly config: AppConfig,
  ) {}

  /** P1.AUTH.03 — 302 to the issuer's authorisation endpoint. */
  @Get('start')
  @Public()
  async start(
    @ZQuery(googleStartQuerySchema) query: GoogleStartQuery,
    @Res() res: Response,
  ): Promise<void> {
    const { location, state } = await this.google.start(query.return_to);
    res.append('Set-Cookie', stateCookie(state, 600, this.config.env.SESSION_COOKIE_SECURE));
    res.redirect(302, location);
  }

  /** P1.AUTH.04 — 302 to the stored path with a session, or to the login screen. */
  @Get('callback')
  @Public()
  @Audited({ actions: ['login.success', 'login.failed', 'session.revoked'] })
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const secure = this.config.env.SESSION_COOKIE_SECURE;
    const replacesToken = readCookie(req.header('cookie'), SESSION_COOKIE);
    const result = await this.google.callback(
      req.query as Record<string, unknown>,
      readCookie(req.header('cookie'), STATE_COOKIE),
      requestMeta(replacesToken === undefined ? {} : { replacesToken }),
    );
    res.append('Set-Cookie', stateCookie('', 0, secure));
    if (result.ok) res.append('Set-Cookie', sessionCookie(result.token, secure));
    res.redirect(302, result.location);
  }
}
