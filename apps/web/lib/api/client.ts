import { HttpStatus, type Problem } from '@point/shared';

import { PUBLIC_API_BASE } from '../../env';

// The staff app's API client (API-AUTH-02 · API-AUD-02 · AD-AUTH-01 · AD-PERM-03 · design D17): a
// relative base on the app's own origin, the app header the CSRF guard needs and `X-Client: web` on
// every call, a problem body turned into `ApiProblem`. One 401 handler and one 403 handler, installed by
// the session layer: a lost session goes to the login screen, an unexpected 403 refetches `/me` once.
// The sign-in calls opt out — a wrong code is a 401 the login screen shows itself.

export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem,
    /** The response's `Date` header, as epoch ms: the server's "now" for a lock end (no device clock). */
    readonly serverTime: number | undefined,
  ) {
    super(problem.code);
    this.name = 'ApiProblem';
  }
}

export interface ApiHandlers {
  /** A staff call answered 401 (`unauthenticated` or `session_revoked`). */
  readonly onUnauthorized?: (problem: Problem) => void;
  /** A staff call answered 403. */
  readonly onForbidden?: (problem: Problem) => void;
}

let handlers: ApiHandlers = {};

/** Installed once by the session layer; returns the uninstall. */
export function setApiHandlers(next: ApiHandlers): () => void {
  handlers = next;
  return () => {
    if (handlers === next) handlers = {};
  };
}

export interface ApiRequest {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  /** Sign-in calls: a 401 or 403 is the caller's to show, not the session layer's. */
  readonly signIn?: boolean;
}

const fallbackProblem = (status: number): Problem => ({
  type: 'about:blank',
  title: '',
  status,
  code:
    status === HttpStatus.UNAUTHORIZED
      ? 'unauthenticated'
      : status === HttpStatus.NOT_FOUND
        ? 'not_found'
        : 'internal_error',
  request_id: '',
});

/** `GET /v1/me` → `api<MeResponse>('/me')`. Throws ApiProblem for any status ≥ 400. */
export async function api<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const { method = 'GET', body, signIn = false } = request;
  const response = await fetch(`${PUBLIC_API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'point-app',
      'X-Client': 'web',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === HttpStatus.NO_CONTENT) return undefined as T;
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data as T;

  const problem =
    data !== null && typeof data === 'object' && 'code' in data
      ? (data as Problem)
      : fallbackProblem(response.status);
  const date = response.headers.get('date');
  const failure = new ApiProblem(
    response.status,
    problem,
    date === null ? undefined : Date.parse(date),
  );
  if (!signIn && response.status === HttpStatus.UNAUTHORIZED) handlers.onUnauthorized?.(problem);
  if (!signIn && response.status === HttpStatus.FORBIDDEN) handlers.onForbidden?.(problem);
  throw failure;
}
