import { scrubEvent } from '@point/shared';

import type { WebEnv } from '../../env';
import { ApiProblem } from '../api/client';

// Error reporting of the web app (add-staging-deploy design D10 · ADR-007 decision 3 · CG-OBS-04).
// The DSN, the environment and the release are read at run time by env.ts, so one image serves every
// environment and nothing is compiled in. Browser and server start the SDK with the options below:
// only the integrations each names, no tracing, no replay, no breadcrumbs, nothing of the user,
// cookies, headers, bodies or query strings; `beforeSend` is the API's scrubber (packages/shared).
// A refused answer of the API (400 – 429) is never an event (platform-runtime spec): a call such as
// `void api(…)` whose rejection nobody catches would otherwise reach the global handlers.

export interface ReportingOptions {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string;
}

/** The options of the running environment; undefined = no DSN, error reporting off. */
export function reportingOf(
  env: Pick<WebEnv, 'SENTRY_DSN_WEB' | 'APP_ENV' | 'APP_VERSION'>,
): ReportingOptions | undefined {
  if (env.SENTRY_DSN_WEB === undefined) return undefined;
  return { dsn: env.SENTRY_DSN_WEB, environment: env.APP_ENV, release: env.APP_VERSION };
}

/** An API answer from 400 to 429 — the caller's request was refused, nothing broke. */
export function isRefusal(error: unknown): boolean {
  return error instanceof ApiProblem && error.status >= 400 && error.status <= 429;
}

/** The `Sentry.init` options both runtimes share; each adds its own integrations. */
export const initOptions = ({ dsn, environment, release }: ReportingOptions) => ({
  dsn,
  environment,
  release,
  defaultIntegrations: false as const,
  maxBreadcrumbs: 0,
  sendClientReports: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
  },
  beforeSend: <E extends Parameters<typeof scrubEvent>[0]>(
    event: E,
    hint?: { originalException?: unknown },
  ): E | null => (isRefusal(hint?.originalException) ? null : scrubEvent(event)),
});
