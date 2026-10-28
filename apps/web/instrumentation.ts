import type { Instrumentation } from 'next';

import { getEnv } from './env';
import { initOptions, reportingOf } from './lib/observability/options';

// Server-render errors (add-staging-deploy design D10 · CG-OBS-04): Next.js calls `register` once
// when the server starts and `onRequestError` for every error of a server render, route handler or
// proxy. Without SENTRY_DSN_WEB nothing is loaded and nothing is reported.

type Sdk = typeof import('@sentry/nextjs');

let server: Promise<Sdk> | undefined;

export function register(): void {
  // An incomplete environment is reported by the first request that needs it (getEnv in proxy.ts),
  // with every variable's name; it does not stop the server here.
  let env;
  try {
    env = getEnv();
  } catch {
    return;
  }
  const options = reportingOf(env);
  if (options === undefined) return;
  server = import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      ...initOptions(options),
      integrations: [Sentry.linkedErrorsIntegration(), Sentry.dedupeIntegration()],
    });
    return Sentry;
  });
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const Sentry = await server;
  Sentry?.captureRequestError(error, request, context);
};
