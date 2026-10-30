import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpStatus } from '@point/shared';

import { ApiProblem, api, setApiHandlers } from './client';

// add-foundation-auth-access task 7.1 — the API client (API-AUTH-02 · API-AUD-02 · AD-AUTH-01 ·
// AD-PERM-03 · design D17), with a mocked fetch.

const fetchMock = vi.fn<typeof fetch>();
/** Caddy's answer while the API is down: the edge's, not an API status (API-SHAPE-04). */
const BAD_GATEWAY = 502;

function answer(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const problem = (status: number, code: string, extra: object = {}) => ({
  type: 'about:blank',
  title: code,
  status,
  code,
  request_id: '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70',
  ...extra,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api() (task 7.1)', () => {
  it('calls /api/v1 on the same origin with the app header and X-Client: web', async () => {
    fetchMock.mockResolvedValue(answer(200, { ok: true }));
    expect(await api('/me')).toStrictEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/me');
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'point-app', 'X-Client': 'web' },
    });
  });

  it('sends a JSON body', async () => {
    fetchMock.mockResolvedValue(answer(200, {}));
    await api('/me', { method: 'PATCH', body: { ui_language: 2 } });
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      method: 'PATCH',
      body: '{"ui_language":2}',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('returns nothing for 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: HttpStatus.NO_CONTENT }));
    expect(await api('/auth/logout', { method: 'POST' })).toBeUndefined();
  });

  it('throws ApiProblem with the problem body and the server time', async () => {
    fetchMock.mockResolvedValue(
      answer(401, problem(401, 'login_locked', { until: '2026-10-05T09:34:00+06:30' }), {
        Date: 'Mon, 05 Oct 2026 02:44:00 GMT',
      }),
    );
    const failure = await api('/auth/otp/verify', { method: 'POST', signIn: true }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ApiProblem);
    expect(failure).toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      problem: { code: 'login_locked', until: '2026-10-05T09:34:00+06:30' },
      serverTime: Date.parse('2026-10-05T02:44:00Z'),
    });
  });

  it('hands a 401 to the one handler: session_revoked with its reason', async () => {
    const onUnauthorized = vi.fn();
    const uninstall = setApiHandlers({ onUnauthorized });
    fetchMock.mockResolvedValue(answer(401, problem(401, 'session_revoked', { reason: 3 })));
    await expect(api('/me')).rejects.toBeInstanceOf(ApiProblem);
    expect(onUnauthorized).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'session_revoked', reason: 3 }),
    );
    uninstall();
  });

  it('hands a 403 to the one handler', async () => {
    const onForbidden = vi.fn();
    const uninstall = setApiHandlers({ onForbidden });
    fetchMock.mockResolvedValue(answer(403, problem(403, 'forbidden')));
    await expect(api('/branches')).rejects.toBeInstanceOf(ApiProblem);
    expect(onForbidden).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('a sign-in call keeps its 401 to itself', async () => {
    const onUnauthorized = vi.fn();
    const uninstall = setApiHandlers({ onUnauthorized });
    fetchMock.mockResolvedValue(answer(401, problem(401, 'otp_invalid')));
    await expect(api('/auth/otp/verify', { method: 'POST', signIn: true })).rejects.toMatchObject({
      problem: { code: 'otp_invalid' },
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    uninstall();
  });

  it('a body that is not a problem still gives a problem', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: BAD_GATEWAY }));
    await expect(api('/me')).rejects.toMatchObject({
      status: BAD_GATEWAY,
      problem: { code: 'internal_error' },
    });
  });
});
