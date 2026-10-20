import type { Problem } from '@point/shared';

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
  /** Extra request headers, e.g. the `Idempotency-Key` of a row-creating money call (API-IDEM-01). */
  readonly headers?: Readonly<Record<string, string>>;
}

const fallbackProblem = (status: number): Problem => ({
  type: 'about:blank',
  title: '',
  status,
  code: status === 401 ? 'unauthenticated' : status === 404 ? 'not_found' : 'internal_error',
  request_id: '',
});

/** `GET /v1/me` → `api<MeResponse>('/me')`. Throws ApiProblem for any status ≥ 400. */
export async function api<T>(path: string, request: ApiRequest = {}): Promise<T> {
  return (await send<T>(path, request)).data;
}

/**
 * The same call, with what the response says about itself: `replayed` = `Idempotent-Replayed: true`,
 * the answer of a repeated `Idempotency-Key` (API-IDEM-01 — "Already saved").
 */
export async function apiWithMeta<T>(
  path: string,
  request: ApiRequest = {},
): Promise<{ readonly data: T; readonly replayed: boolean }> {
  const { data, response } = await send<T>(path, request);
  return { data, replayed: response.headers.get('idempotent-replayed') === 'true' };
}

/** A file answer (API-SHAPE-05 — a receipt PDF) as a Blob; a refusal is still an ApiProblem. */
export async function apiBlob(path: string, request: ApiRequest = {}): Promise<Blob> {
  return (await send<Blob>(path, request, 'blob')).data;
}

async function send<T>(
  path: string,
  request: ApiRequest,
  read: 'json' | 'blob' = 'json',
): Promise<{ readonly data: T; readonly response: Response }> {
  const { method = 'GET', body, signIn = false, headers = {} } = request;
  const response = await fetch(`${PUBLIC_API_BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'point-app',
      'X-Client': 'web',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return { data: undefined as T, response };
  if (response.ok && read === 'blob') return { data: (await response.blob()) as T, response };
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return { data: data as T, response };

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
  if (!signIn && response.status === 401) handlers.onUnauthorized?.(problem);
  if (!signIn && response.status === 403) handlers.onForbidden?.(problem);
  throw failure;
}
