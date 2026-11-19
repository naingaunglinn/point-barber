'use client';

import { useEffect } from 'react';

import '@point/ui/tokens.css';

import { reportCaught } from '../lib/observability/browser';

// The web app's last error boundary (Next.js `global-error`): a render error that no route caught
// replaces the root layout, so it renders its own `<html>`. It reports the error when error
// reporting is on (add-staging-deploy design D10). Like global-not-found it has no literal text
// (D-PLT-03 · AD-L10N-01).
export default function GlobalError({ error }: Readonly<{ error: Error & { digest?: string } }>) {
  useEffect(() => {
    reportCaught(error);
  }, [error]);
  return (
    <html lang="my">
      <body>
        <main data-testid="app-error" />
      </body>
    </html>
  );
}
