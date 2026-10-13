'use client';

import { useLayoutEffect } from 'react';

import type { Locale, Tree } from '@point/ui';

// The catalogue's `lang` and `theme` parameters on `<html>` (design D12). The staff root layout
// renders `<html>` from the cookie and the staff tree, and a layout never sees the query string, so
// this page sets both attributes after hydration and restores them when it unmounts. It also marks
// `<html data-catalogue-ready>` once hydrated, so the Playwright specs (e2e/dev-ui) measure the page the
// user sees, never the server HTML before the parameters apply.
export function HtmlAttributes({ lang, tree }: Readonly<{ lang: Locale; tree: Tree }>) {
  useLayoutEffect(() => {
    const html = document.documentElement;
    const previous = { lang: html.lang, tree: html.dataset.tree };
    html.lang = lang;
    html.dataset.tree = tree;
    html.dataset.catalogueReady = '';
    return () => {
      delete html.dataset.catalogueReady;
      html.lang = previous.lang;
      if (previous.tree === undefined) delete html.dataset.tree;
      else html.dataset.tree = previous.tree;
    };
  }, [lang, tree]);
  return null;
}
