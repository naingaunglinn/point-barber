'use client';

import { useEffect } from 'react';

import { startBrowserReporting } from './browser';
import type { ReportingOptions } from './options';

// Mounted by both root layouts only when SENTRY_DSN_WEB is set (add-staging-deploy design D10). It
// renders nothing; after the first paint it loads and starts the browser SDK.
export function ErrorReporting({ dsn, environment, release }: ReportingOptions) {
  useEffect(() => {
    void startBrowserReporting({ dsn, environment, release });
  }, [dsn, environment, release]);
  return null;
}
