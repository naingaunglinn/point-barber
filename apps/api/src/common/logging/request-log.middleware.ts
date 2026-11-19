import { performance } from 'node:perf_hooks';

import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

import { RequestContext } from '../http/request-context.js';
import { requestLogLine } from './request-log.js';

/** The pattern of the route Express matched (`/api/v1/me/sessions/:id`); undefined for none. */
function routePattern(req: Request): string | undefined {
  const path: unknown = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : undefined;
}

// One info line per finished request (ADR-007 · design D5). `req.ip` is the address Caddy saw:
// Express trusts exactly one proxy hop (design D5 / D12).
export function requestLogMiddleware(log: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = performance.now();
    const requestId = RequestContext.current()?.request_id ?? '';
    res.on('finish', () => {
      log.info(
        requestLogLine({
          request_id: requestId,
          method: req.method,
          originalUrl: req.originalUrl,
          route: routePattern(req),
          status: res.statusCode,
          duration_ms: performance.now() - started,
          client_ip: req.ip,
        }),
        'request',
      );
    });
    next();
  };
}
