import type { ReactNode } from 'react';

import { fontPreloads, type Locale, type Tree } from '@point/ui';

import '@point/ui/tokens.css';

import { ErrorReporting } from '../lib/observability/error-reporting';
import type { ReportingOptions } from '../lib/observability/options';

// The root `<html>` of a route tree (add-shared-ui-components task 1.11 · design D1): one root
// layout per tree, so each sets its own `data-tree` (the site palette and fonts of tokens.css) and
// `lang` (the language its layout resolved — design D6), and preloads only the fonts of that tree and
// language in the first HTML (FE-PERF-06). With error reporting on (`reporting`, from
// SENTRY_DSN_WEB at run time) it mounts <ErrorReporting> (add-staging-deploy design D10).
export function RootLayout({
  tree,
  locale,
  reporting,
  children,
}: Readonly<{
  tree: Tree;
  locale: Locale;
  reporting?: ReportingOptions | undefined;
  children: ReactNode;
}>) {
  return (
    <html lang={locale} data-tree={tree}>
      <head>
        {fontPreloads(tree, locale).map(({ href, type }) => (
          <link
            key={href}
            rel="preload"
            href={href}
            as="font"
            type={type}
            crossOrigin="anonymous"
          />
        ))}
      </head>
      <body>
        {children}
        {reporting === undefined ? null : <ErrorReporting {...reporting} />}
      </body>
    </html>
  );
}
