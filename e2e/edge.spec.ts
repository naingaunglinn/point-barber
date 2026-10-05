import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './fixtures.js';
import { rawRequest } from './helpers/raw-request.js';
import { COMPOSE, SITE_HOST } from './hosts.js';

// The edge and the built stack (design D12 · D18): Playwright's request API through Caddy, and raw
// request lines where an HTTP client would clean the path. Part 1 and the hardening and
// configuration checks are Dev 2's (tasks 8.3, 8.5, 8.6, 8.7); part 2 is Dev 1's (task 8.4).
//
// An edge 404 has an empty body and no X-Request-Id; an API 404 is problem JSON with the header —
// that difference shows whether a request reached NestJS.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = (args: string): string =>
  execSync(`${COMPOSE} ${args}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

interface Answer {
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
}

async function expectEdge404(res: Answer): Promise<void> {
  expect(res.status()).toBe(404);
  expect(await res.text()).toBe('');
  expect(res.headers()).not.toHaveProperty('x-request-id');
  expect(res.headers()).not.toHaveProperty('set-cookie');
}

async function expectApi404(res: Answer): Promise<void> {
  expect(res.status()).toBe(404);
  expect(res.headers()['content-type']).toMatch(/^application\/problem\+json/);
  expect(res.headers()).toHaveProperty('x-request-id');
  expect(JSON.parse(await res.text())).toMatchObject({ code: 'not_found', status: 404 });
}

// ── Part 1 (task 8.3) ────────────────────────────────────────────────────────────────────────────

test.describe("add-repo-scaffold · platform-runtime · API is served under /api/v1 on the web app's own origin", () => {
  test('Scenario: Staff host serves the API under /api/v1', async ({ app }) => {
    const res = await app.get('/api/v1/health');
    expect(res.status()).toBe(200);
    expect(res.headers()).toHaveProperty('x-request-id');
  });

  test('Scenario: A path without the /api prefix is not the API', async ({ app }) => {
    const res = await app.get('/v1/health');
    expect(res.status()).toBe(404);
    expect(res.headers()).not.toHaveProperty('x-request-id');
    expect(res.headers()['content-type']).toMatch(/^text\/html/);
  });
});

test.describe('add-repo-scaffold · platform-runtime · Public host forwards only the public, health and status paths', () => {
  test('Scenario: Health and status are reachable on the public host', async ({ site }) => {
    for (const path of ['/api/v1/health', '/api/v1/system/status']) {
      const res = await site.get(path);
      expect(res.status(), path).toBe(200);
      expect(res.headers(), path).toHaveProperty('x-request-id');
    }
  });

  test('Scenario: The public API prefix is forwarded', async ({ site }) => {
    await expectApi404(await site.get('/api/v1/public/site'));
  });

  test('Scenario: A staff login path is refused at the edge', async ({ site }) => {
    await expectEdge404(
      await site.post('/api/v1/auth/otp/request', { data: { email: 'aung@point.test' } }),
    );
  });

  test('Scenario: A look-alike of an allowed path is refused', async ({ site }) => {
    await expectEdge404(await site.get('/api/v1/healthz'));
  });

  // Task 8.5. Caddy matches on the normalised path, so the encoded form needs no extra rule (D12).
  test('Scenario: A dot-segment path does not slip through the allow list', async () => {
    for (const path of [
      '/api/v1/public/../auth/otp/request',
      '/api/v1/public/%2e%2e/auth/otp/request',
    ]) {
      const res = await rawRequest({ host: SITE_HOST, path });
      expect(res.status, path).toBe(404);
      expect(res.body, path).toBe('');
      expect(res.headers, path).not.toHaveProperty('x-request-id');
      expect(res.headers, path).not.toHaveProperty('set-cookie');
    }
  });
});

test.describe('add-repo-scaffold · platform-runtime · Internal paths are unreachable from outside', () => {
  test('Scenario: Internal API on the staff host with a key header', async ({ app }) => {
    await expectEdge404(
      await app.post('/api/v1/internal/backup-runs', { headers: { 'X-Internal-Key': 'anything' } }),
    );
  });

  test('Scenario: Internal API on the public host', async ({ site }) => {
    await expectEdge404(
      await site.get('/api/v1/internal/backup-runs/0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70'),
    );
  });

  test("Scenario: The web app's internal hook path on both hosts", async ({ site, app }) => {
    await expectEdge404(await site.post('/internal/revalidate'));
    await expectEdge404(await app.post('/internal/revalidate'));
  });
});

// ── Hardening (task 8.5) ─────────────────────────────────────────────────────────────────────────

test.describe('add-repo-scaffold · platform-runtime · An unknown route answers 404 not_found', () => {
  test('Scenario: Test fixture routes are not in the shipped build', async ({ app }) => {
    await expectApi404(await app.get('/api/v1/_fixtures/boom'));
  });
});

test.describe('edge: client address (design D5 / D12)', () => {
  test('a client-sent X-Forwarded-For is not the client_ip the API logs', async ({ app }) => {
    const requestId = randomUUID();
    const res = await app.get('/api/v1/health', {
      headers: { 'X-Forwarded-For': '203.0.113.9', 'X-Request-Id': requestId },
    });
    expect(res.headers()['x-request-id']).toBe(requestId);

    let line: Record<string, unknown> | undefined;
    await expect
      .poll(() => {
        const logs = compose('logs --no-color --no-log-prefix api');
        const found = logs
          .split('\n')
          .find((l) => l.includes(requestId) && l.includes('"client_ip"'));
        line = found
          ? (JSON.parse(found.slice(found.indexOf('{'))) as Record<string, unknown>)
          : undefined;
        return line !== undefined;
      })
      .toBe(true);
    expect(line?.client_ip).toBeTruthy();
    expect(line?.client_ip).not.toBe('203.0.113.9');
  });
});

// ── Database stopped (task 8.6) ──────────────────────────────────────────────────────────────────

test.describe('add-repo-scaffold · platform-runtime · Health endpoint is a details-free liveness probe', () => {
  test('Scenario: Database stopped', async ({ app }) => {
    test.setTimeout(180_000);
    const health = async (): Promise<Record<string, unknown>> => {
      const res = await app.get('/api/v1/health');
      expect(res.status()).toBe(200);
      return (await res.json()) as Record<string, unknown>;
    };

    compose('stop postgres');
    try {
      await expect.poll(async () => (await health()).status, { timeout: 30_000 }).toBe('degraded');
      const body = await health();
      expect(Object.keys(body).sort()).toStrictEqual(['status', 'time']);
      expect(JSON.stringify(body)).not.toMatch(/postgres|ECONN|error|backup|job/i);
    } finally {
      compose('start postgres');
    }
    await expect.poll(async () => (await health()).status, { timeout: 90_000 }).toBe('ok');
  });
});

// ── Configured here, specified later (task 8.7 · D12) ────────────────────────────────────────────

test.describe('edge: configuration whose requirement arrives with a later change (D12)', () => {
  // add-attachments-upload. The body is JSON, which the API reads: an upstream that answers before
  // reading the body would race the edge's 413 (PR #6 review).
  test('a 12 MB body to the staff host is refused by the edge with 413', async ({ app }) => {
    const body = `{"x":"${'a'.repeat(12 * 1024 * 1024)}"}`;
    const res = await app.post('/api/v1/health', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from(body),
    });
    expect(res.status()).toBe(413);
    expect(res.headers()).not.toHaveProperty('x-request-id');
  });

  // add-realtime-gateway: /rt* reaches the API, which answers its problem 404 until the gateway exists.
  test('https://app.point.test/rt reaches the API', async ({ app }) => {
    await expectApi404(await app.get('/rt'));
  });

  // The dev override's read-only alias of the staff host.
  test('GET http://localhost:3000/api/v1/health answers 200 in the dev override', async ({
    playwright,
  }) => {
    const context = await playwright.request.newContext();
    try {
      const res = await context.get('http://localhost:3000/api/v1/health');
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ status: 'ok' });
    } finally {
      await context.dispose();
    }
  });
});

// ── Part 2 (task 8.4, Dev 1) ─────────────────────────────────────────────────────────────────────
