import { scrubEvent } from '@point/shared';

import type { ErrorSink } from '../../../common/observability/error-reporter.js';

// The one file that imports @sentry/nestjs (CG-ARCH-08 · guideline §24 #22 · add-staging-deploy
// design D9). Loaded only when SENTRY_DSN_API is set, with a dynamic import, so an API without a DSN
// never loads the SDK. Capture is explicit — the problem filter and the jobs worker call it — so
// every integration that captures or collects by itself is off: no default integrations, no
// tracing, no breadcrumbs, no runtime instrumentation, nothing of the user, cookies, headers, bodies
// or query strings; `beforeSend` scrubs what is left (scrubEvent of packages/shared).

export interface SentryOptions {
  readonly dsn: string;
  readonly release: string;
  readonly environment: string;
}

export async function startSentry({
  dsn,
  release,
  environment,
}: SentryOptions): Promise<ErrorSink> {
  const Sentry = await import('@sentry/nestjs');
  Sentry.init({
    dsn,
    release,
    environment,
    defaultIntegrations: false,
    // A thrown error's `cause` chain, and one event for an error reported twice.
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    enableRuntimeChannelInjection: false,
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
    beforeSend: (event) => scrubEvent(event),
  });
  return {
    capture(error, tags, request) {
      Sentry.withScope((scope) => {
        scope.setTags(tags);
        if (request !== undefined) {
          scope.addEventProcessor((event) => ({
            ...event,
            request: { url: request.url, method: request.method },
          }));
        }
        Sentry.captureException(error);
      });
    },
    close: (timeoutMs) => Sentry.close(timeoutMs),
  };
}
