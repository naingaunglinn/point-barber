import { initOptions, type ReportingOptions } from './options';

// The browser part of @sentry/nextjs, loaded with a dynamic import() after the first paint so the LCP
// budget of the site and the POS screens is not spent on it (add-staging-deploy design D10 ·
// FE-PERF-01). An error thrown before it has loaded is not reported (accepted in D10). Uncaught
// errors and unhandled rejections are reported by the global handlers; global-error.tsx reports the
// render errors that Next.js's own boundary catches.

type Sdk = typeof import('@sentry/nextjs');

let loading: Promise<Sdk> | undefined;

/** Loads and starts the SDK once per page; later calls return the same promise. */
export function startBrowserReporting(options: ReportingOptions): Promise<Sdk> {
  loading ??= import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      ...initOptions(options),
      integrations: [
        Sentry.globalHandlersIntegration(),
        Sentry.linkedErrorsIntegration(),
        Sentry.dedupeIntegration(),
        // The page URL (its query string is cut by beforeSend) and the browser.
        Sentry.httpContextIntegration(),
      ],
    });
    // The end-to-end test waits for this before it throws (add-staging-deploy task 5.3).
    document.documentElement.dataset.errorReporting = 'ready';
    return Sentry;
  });
  return loading;
}

/** Reports an error caught by an error boundary — only when the SDK was started. */
export function reportCaught(error: unknown): void {
  void loading?.then((Sentry) => Sentry.captureException(error));
}
