import { connection } from 'next/server';
import { Suspense } from 'react';

import { getEnv } from '../../env';
import { ErrorReporting } from './error-reporting';
import { reportingOf } from './options';

// The error-reporting values of the running environment (add-staging-deploy design D10 · ADR-007
// decision 3), read per request inside their own Suspense boundary. Only this hole of the page is
// dynamic: the layouts around it stay static, so the cached site pages of ADR-006 are not turned into
// a render on every request (CG-SEC-12 — the reason D8 turned down nonces). Without SENTRY_DSN_WEB it
// renders nothing and no SDK code is loaded.

/** `connection()` first: `next build` prerenders nothing of this, so the values are never baked in. */
export async function RuntimeReportingValues() {
  await connection();
  const options = reportingOf(getEnv());
  return options === undefined ? null : <ErrorReporting {...options} />;
}

export function RuntimeReporting() {
  return (
    <Suspense fallback={null}>
      <RuntimeReportingValues />
    </Suspense>
  );
}
