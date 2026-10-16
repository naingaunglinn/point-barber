import { NextResponse, type NextRequest } from 'next/server';

import { getEnv } from './env';
import { resolveRoute, type RouteHosts } from './resolve-route';

// A path no route can match (a leading `_` marks a private folder, never a route), so the
// request renders the app's not-found page with status 404.
const NOT_FOUND_PATHNAME = '/_not-routed';

// Next.js 16 proxy (formerly middleware.ts): applies the host rewrite of resolve-route.ts to every
// request the matcher lets through (ADR-001 · design D11).
export function proxy(request: NextRequest): NextResponse {
  const { SITE_ORIGIN, APP_ORIGIN } = getEnv();
  const hosts: RouteHosts = { site: new URL(SITE_ORIGIN).host, staff: new URL(APP_ORIGIN).host };
  const decision = resolveRoute(request.headers.get('host') ?? '', request.nextUrl.pathname, hosts);

  const url = request.nextUrl.clone(); // keeps the query string
  switch (decision.kind) {
    case 'pass':
      return NextResponse.next();
    case 'rewrite':
      url.pathname = decision.pathname;
      return NextResponse.rewrite(url);
    case 'not-found':
      url.pathname = NOT_FOUND_PATHNAME;
      return NextResponse.rewrite(url);
  }
}

export const config = {
  // Everything except Next.js's own assets under /_next/, the self-hosted fonts under /fonts/
  // (public/fonts, copied from packages/ui/fonts — add-shared-ui-components design D3) and the
  // vendored library files under /vendor/ (public/vendor — the QR scanner's WebAssembly). A folder
  // added to public/ later gets its own exclusion here — never a "path with a dot" pattern, which
  // would let /staff/<x>.<y> skip the 404 rule (design D11).
  matcher: ['/((?!_next/|fonts/|vendor/).*)'],
};
