// Host rewrite of the one Next.js app that serves both hosts (ADR-001 · API-META-04 · design D11), and
// the signed-out redirect of the staff host (add-foundation-auth-access design D17): the public host
// gets the `site` route tree, the staff host the `staff` route tree, and a staff path other than the
// login screen and the catalogue sends a browser without a `point_session` cookie to `/login`. A pure
// function, so every case is a unit test; proxy.ts applies the decision.

export const RouteTree = { SITE: 'site', STAFF: 'staff' } as const;
export type RouteTree = (typeof RouteTree)[keyof typeof RouteTree];

/** The host (`point.test`, `app.point.test`) that serves each route tree. */
export type RouteHosts = Readonly<Record<RouteTree, string>>;

export type RouteDecision =
  | Readonly<{ kind: 'pass' }>
  | Readonly<{ kind: 'rewrite'; pathname: string }>
  | Readonly<{ kind: 'redirect'; location: string }>
  | Readonly<{ kind: 'not-found' }>;

export interface RouteRequest {
  /** The query string with its `?`, or empty. */
  readonly search?: string;
  /**
   * The request carries a `point_session` cookie. A presence test for a clean first paint only — the
   * API decides whether the session is valid (AD-PERM-01).
   */
  readonly hasSession?: boolean;
}

// Reserved for POST /internal/revalidate (ADR-006), called over the Docker network as `web:3000`;
// the edge answers 404 for it from outside.
const INTERNAL_PREFIX = '/internal/';

const TREES: readonly RouteTree[] = [RouteTree.SITE, RouteTree.STAFF];

/** The staff paths that open without a session: the login screen and the component catalogue. */
const OPEN_STAFF_PATHS = ['/login', '/dev/ui'];

const isOpenStaffPath = (pathname: string): boolean =>
  OPEN_STAFF_PATHS.some((open) => pathname === open || pathname.startsWith(`${open}/`));

export function resolveRoute(
  host: string,
  pathname: string,
  hosts: RouteHosts,
  { search = '', hasSession = false }: RouteRequest = {},
): RouteDecision {
  if (pathname.startsWith(INTERNAL_PREFIX)) return { kind: 'pass' };

  // A tree is reachable only through the rewrite, never by its folder name.
  const namesTree = TREES.some(
    (tree) => pathname === `/${tree}` || pathname.startsWith(`/${tree}/`),
  );
  if (namesTree) return { kind: 'not-found' };

  const requestHost = host.toLowerCase();
  const tree = TREES.find((candidate) => hosts[candidate].toLowerCase() === requestHost);
  if (tree === undefined) return { kind: 'not-found' };

  if (tree === RouteTree.STAFF && !hasSession && !isOpenStaffPath(pathname)) {
    return {
      kind: 'redirect',
      location: `/login?return_to=${encodeURIComponent(`${pathname}${search}`)}`,
    };
  }
  return { kind: 'rewrite', pathname: pathname === '/' ? `/${tree}` : `/${tree}${pathname}` };
}
