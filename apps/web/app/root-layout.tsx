import type { ReactNode } from 'react';

import { fontPreloads, type Locale, type Tree } from '@point/ui';

import '@point/ui/tokens.css';

// The root `<html>` of a route tree (add-shared-ui-components task 1.11 · design D1): one root
// layout per tree, so each sets its own `data-tree` (the site palette and fonts of tokens.css) and
// `lang`, and preloads only the fonts of that tree and language in the first HTML (FE-PERF-06).
// `lang` is the default UI language — `system.default_language` 1 = MY (API Part 1) — until task
// 3.10 reads it from the session or the cookie.
export function RootLayout({ tree, children }: Readonly<{ tree: Tree; children: ReactNode }>) {
  const locale: Locale = 'my';
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
      <body>{children}</body>
    </html>
  );
}
