import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@point/shared';
import type { Request } from 'express';

import type { AccessDeclaration } from '../access/declarations.js';
import { ACCESS_METADATA } from '../access/public.decorator.js';
import { AppConfig } from '../config/config.js';
import { ProblemException } from './problem.exception.js';

// The first global guard (API-AUTH-02 · ADR-005 action item 4 · design D2): a changing request must
// carry `X-Requested-With: point-app` and come from the staff app's origin — `Origin`, or the origin
// of `Referer` when `Origin` is absent. It runs before the session guard, so a forged request is
// refused before any session or database work. The public website's API and @Internal() routes are
// not browser calls of the staff app and are not checked.

export const APP_HEADER = 'point-app';
const CHANGING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const PUBLIC_API = '/api/v1/public/';

function originOf(value: string | undefined): string | undefined {
  if (value === undefined || !URL.canParse(value)) return undefined;
  return new URL(value).origin;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!CHANGING.has(req.method.toUpperCase()) || req.path.startsWith(PUBLIC_API)) return true;
    const declaration = this.reflector.getAllAndOverride<AccessDeclaration | undefined>(
      ACCESS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (declaration?.kind === 'internal') return true;
    const origin = req.header('origin') ?? originOf(req.header('referer'));
    if (req.header('x-requested-with') !== APP_HEADER || origin !== this.config.env.APP_ORIGIN) {
      throw new ProblemException(ErrorCode.CSRF, 403);
    }
    return true;
  }
}
