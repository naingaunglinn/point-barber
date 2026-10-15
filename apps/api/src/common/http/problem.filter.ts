import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Inject,
} from '@nestjs/common';
import { ErrorCode, type Problem } from '@point/shared';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';

import { AppConfig } from '../config/config.js';
import {
  isClientRequestIdConflict,
  isFinishedImmutable,
  isPaymentReferenceConflict,
} from '../database/errors.js';
import { LOGGER } from '../logging/logger.js';
import { ProblemException } from './problem.exception.js';
import { RequestContext } from './request-context.js';

// One filter produces every error body (API-ERR-01 · API-ERR-02 · CG-ERR-02 · design D7):
// RFC 9457 problem details, Content-Type application/problem+json, the request id in the body.

/** `not_found` → `Not found`. */
export function titleOf(code: string): string {
  const words = code.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface BodyParserError {
  readonly type: string;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  typeof error === 'object' &&
  error !== null &&
  'type' in error &&
  (error.type === 'entity.parse.failed' || error.type === 'entity.too.large');

/** Maps anything thrown to a ProblemException; null = an unexpected failure (500). */
function toProblem(error: unknown): ProblemException | null {
  if (error instanceof ProblemException) return error;
  // Two requests with one Idempotency-Key: the second hit the client_request_id index (CG-DB-12 ·
  // add-foundation-auth-access D14); its transaction is aborted and the retry replays.
  if (isClientRequestIdConflict(error))
    return new ProblemException(ErrorCode.IDEMPOTENCY_IN_PROGRESS, 409);
  // The reference index behind the reference lock (add-walkin-visit-checkout design D9): the other
  // payment's sale is still OPEN when this is reached, so no receipt number is known.
  if (isPaymentReferenceConflict(error))
    return new ProblemException(ErrorCode.DUPLICATE_REFERENCE, 409, {
      context: { receipt_number: null },
    });
  // The second wall (add-walkin-visit-checkout design D9): a finished record reached its guard trigger.
  if (isFinishedImmutable(error)) return new ProblemException(ErrorCode.LOCKED, 423);
  // The JSON body could not be read: unparseable or above the 1 MB limit (design D7, reading 5).
  if (isBodyParserError(error))
    return new ProblemException(ErrorCode.VALIDATION, 400, { errors: [] });
  if (error instanceof HttpException) {
    // The Express adapter turns the parser's SyntaxError (unparseable JSON) and a URIError (a path
    // with a bad percent-encoding) into a plain 400 before the filter sees them. Application code
    // throws only ProblemException, so a framework 400 always means "the request could not be read".
    if (error.getStatus() === 400)
      return new ProblemException(ErrorCode.VALIDATION, 400, { errors: [] });
    // The framework's "route not found" (an unknown path, or an undefined method on a known path).
    if (error.getStatus() === 404) return new ProblemException(ErrorCode.NOT_FOUND, 404);
  }
  return null;
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId =
      RequestContext.current()?.request_id ?? String(res.getHeader('X-Request-Id') ?? '');

    // No endpoint should reach the guard triggers — the state checks come first (design D9).
    if (isFinishedImmutable(error))
      this.log.error(
        { request_id: requestId, err: error },
        'finished record reached its guard trigger',
      );
    let problem = toProblem(error);
    if (problem === null) {
      // Logged with its stack; the client gets only the request id and no detail (D7 · API-ERR-02).
      this.log.error({ request_id: requestId, err: error, method: req.method }, 'unhandled error');
      problem = new ProblemException(ErrorCode.INTERNAL_ERROR, 500);
    }

    const { detail, errors, context, extensions, headers } = problem.options;
    const body: Problem = {
      type: `${this.config.env.SITE_ORIGIN}/errors/${problem.code}`,
      title: titleOf(problem.code),
      status: problem.status,
      code: problem.code,
      ...(detail === undefined ? {} : { detail }),
      ...(errors === undefined ? {} : { errors: [...errors] }),
      ...(context === undefined ? {} : { context: { ...context } }),
      ...extensions,
      request_id: requestId,
    };
    for (const [name, value] of Object.entries(headers ?? {})) res.setHeader(name, value);
    res.status(problem.status).type('application/problem+json').send(JSON.stringify(body));
  }
}
