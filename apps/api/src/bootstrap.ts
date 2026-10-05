import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { Logger } from 'pino';

import { Clock } from './common/clock/clock.js';
import { ProblemFilter } from './common/http/problem.filter.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';
import { JSON_BODY_LIMIT } from './common/limits.js';
import { LOGGER, PinoNestLogger } from './common/logging/logger.js';
import { requestLogMiddleware } from './common/logging/request-log.middleware.js';

// HTTP set-up shared by main.ts and the integration tests (design D5 · ADR-009). The app is created
// with `bodyParser: false`: the JSON parser is registered here, after the request id, and no
// URL-encoded parser is registered at all.
export function configureApp(app: NestExpressApplication): void {
  const log = app.get<Logger>(LOGGER);
  app.useLogger(new PinoNestLogger(log));
  app.disable('x-powered-by');
  // The client address the API uses is the one Caddy saw — exactly one proxy hop (design D5 / D12).
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware(app.get(Clock)));
  app.use(requestLogMiddleware(log));
  app.use(express.json({ limit: JSON_BODY_LIMIT, type: 'application/json' }));
  // No CORS and no endpoint defines OPTIONS: every preflight is an unknown route (design D5). No
  // OPTIONS handler is needed for that — Nest registers its not-found handler after the routes, so
  // Express's automatic "200 + Allow" answer is never reached and the filter answers 404 not_found
  // (guarded by "A preflight is not answered" in test/edge.int.test.ts).

  // The version is written in each controller's path; no framework versioning (design D5).
  app.setGlobalPrefix('api');
  app.useGlobalFilters(app.get(ProblemFilter));
}
