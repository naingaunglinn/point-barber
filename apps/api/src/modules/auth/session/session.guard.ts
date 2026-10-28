import { createHash } from 'node:crypto';

import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, SESSION_REQUEST_LIMIT, SESSION_REQUEST_WINDOW_SECONDS } from '@point/shared';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';

import type { AccessDeclaration } from '../../../common/access/declarations.js';
import { ACCESS_METADATA } from '../../../common/access/public.decorator.js';
import { Clock } from '../../../common/clock/clock.js';
import { AppConfig } from '../../../common/config/config.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { MaintenanceGate, RateLimiter } from '../../platform/index.js';
import { rateLimited } from '../sign-in/outcome.js';
import { SESSION_COOKIE, readCookie, sessionCookie } from './session-cookie.js';
import { SessionService, sessionState } from './session.service.js';

// The second global guard (P1-RULE-04 · API-AUTH-01 · ADR-005 action item 1 · design D2): on every
// request to a staff endpoint — anything that is not @Public() or @Internal() — the cookie, the
// session row, `revoked_at`, `users.status` and `employees.status`, in this order and before any
// permission check; then the per-session request cap (API-LIM-03 · add-staging-deploy D7) and the
// maintenance step. It fills the request context with the caller.
@Injectable()
export class SessionGuard implements CanActivate {
  /** Per session: the end of the window whose first refusal was logged (one warn line per window). */
  private readonly warned = new Map<string, number>();

  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly maintenance: MaintenanceGate,
    private readonly limiter: RateLimiter,
    private readonly clock: Clock,
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const declaration = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(
      ACCESS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (declaration?.kind === 'public' || declaration?.kind === 'internal') return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const token = readCookie(req.header('cookie'), SESSION_COOKIE);
    if (token === undefined) throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    const state = sessionState(await this.sessions.resolve(token));
    if (state.kind === 'unknown') throw new ProblemException(ErrorCode.UNAUTHENTICATED, 401);
    if (state.kind === 'revoked') {
      throw new ProblemException(ErrorCode.SESSION_REVOKED, 401, {
        extensions: { reason: state.reason },
      });
    }

    // 600 requests per session per 60 s; a refused request is not counted and runs nothing — the
    // access guard, the handler, its transaction and its audit row never start (design D7).
    const cap = this.limiter.hit(
      'session',
      state.session.id,
      SESSION_REQUEST_LIMIT,
      SESSION_REQUEST_WINDOW_SECONDS,
    );
    if (!cap.allowed) {
      this.warnOnce(state.session.id, cap.retryAfter);
      throw rateLimited(cap.retryAfter);
    }

    const ctx = RequestContext.current();
    if (ctx !== undefined) {
      ctx.user_id = state.session.user_id;
      ctx.session_id = state.session.id;
      ctx.employee_id = state.employeeId;
    }
    await this.maintenance.assertOpen();

    if (await this.sessions.seen(state.session, this.clock.now())) {
      http
        .getResponse<Response>()
        .append('Set-Cookie', sessionCookie(token, this.config.env.SESSION_COOKIE_SECURE));
    }
    return true;
  }

  /** The first refusal of a window is logged once, with a hash of the session id — never the cookie. */
  private warnOnce(sessionId: string, retryAfter: number): void {
    const now = this.clock.now().getTime();
    const until = this.warned.get(sessionId);
    if (until !== undefined && now < until) return;
    this.warned.set(sessionId, now + retryAfter * 1000);
    for (const [id, end] of this.warned) if (end <= now) this.warned.delete(id);
    this.log.warn(
      { session: createHash('sha256').update(sessionId).digest('hex').slice(0, 16) },
      'session request cap reached',
    );
  }
}
