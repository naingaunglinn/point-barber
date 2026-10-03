// Host rewrite of the one Next.js app that serves both hosts (ADR-001 · API-META-04 · design D11):
// the public host gets the `site` route tree, the staff host the `staff` route tree. A pure
// function, so every case is a unit test; proxy.ts applies the decision.

export const RouteTree = { SITE: 'site', STAFF: 'staff' } as const;
export type RouteTree = (typeof RouteTree)[keyof typeof RouteTree];

/** The host (`point.test`, `app.point.test`) that serves each route tree. */
export type RouteHosts = Readonly<Record<RouteTree, string>>;

export type RouteDecision =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'rewrite'; pathname: string }>
  | Readonly<{ kind: 'not-found' }>;

// Reserved for POST /internal/revalidate (ADR-006), called over the Docker network as `web:3000`;
// the edge answers 404 for it from outside.
const INTERNAL_PREFIX = '/internal/';

const TREES: readonly RouteTree[] = [RouteTree.SITE, RouteTree.STAFF];

export function resolveRoute(host: string, pathname: string, hosts: RouteHosts): RouteDecision {
  if (pathname.startsWith(INTERNAL_PREFIX)) return { kind: 'pass' };

  // A tree is reachable only through the rewrite, never by its folder name.
  const namesTree = TREES.some(
    (tree) => pathname === `/${tree}` || pathname.startsWith(`/${tree}/`),
  );
  if (namesTree) return { kind: 'not-found' };

  const requestHost = host.toLowerCase();
  const tree = TREES.find((candidate) => hosts[candidate].toLowerCase() === requestHost);
  if (tree === undefined) return { kind: 'not-found' };

  return { kind: 'rewrite', pathname: pathname === '/' ? `/${tree}` : `/${tree}${pathname}` };
}
