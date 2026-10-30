import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
  createParamDecorator,
} from '@nestjs/common';
import { ErrorCode } from '@point/shared';
import type { Request, Response } from 'express';
import { type Observable, map } from 'rxjs';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { RequestContext } from '../../../common/http/request-context.js';

// @Idempotent() on a row-creating endpoint (API-IDEM-01 · design D14): the `Idempotency-Key` header
// is required (missing → 400 idempotency_key_required) and must be a UUID of version 4 or 7 (else
// 400 validation on field `Idempotency-Key`); @IdempotencyKey() hands it to the handler. On a
// replay (Idempotency.run) the answer is 200 with `Idempotent-Replayed: true` instead of 201.

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface KeyedRequest extends Request {
  idempotencyKey?: string;
}

@Injectable()
export class IdempotentInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<KeyedRequest>();
    const res = http.getResponse<Response>();
    const key = req.header(IDEMPOTENCY_KEY_HEADER);
    if (key === undefined || key === '') {
      throw new ProblemException(ErrorCode.IDEMPOTENCY_KEY_REQUIRED, 400);
    }
    if (!KEY.test(key)) {
      throw new ProblemException(ErrorCode.VALIDATION, 400, {
        errors: [{ field: IDEMPOTENCY_KEY_HEADER, code: 'invalid_format' }],
      });
    }
    req.idempotencyKey = key.toLowerCase();

    // Nest sets the route's status (201) before the handler and sends the body after this
    // interceptor without setting it again, so a replay sets 200 here. Errors go through the filter.
    const ctx = RequestContext.current();
    return next.handle().pipe(
      map((body: unknown) => {
        if (ctx?.idempotent_replayed === true) {
          res.status(200);
          res.setHeader('Idempotent-Replayed', 'true');
        }
        return body;
      }),
    );
  }
}

export const Idempotent = () => UseInterceptors(IdempotentInterceptor);

/** The validated, lower-cased `Idempotency-Key` of an @Idempotent() endpoint. */
export const IdempotencyKey = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const key = context.switchToHttp().getRequest<KeyedRequest>().idempotencyKey;
  if (key === undefined) throw new Error('@IdempotencyKey() needs @Idempotent() on the handler');
  return key;
});
