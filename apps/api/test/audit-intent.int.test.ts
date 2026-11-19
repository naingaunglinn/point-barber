import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.5 — the audit intent check (CG-SEC-10 · CG-DB-06 · design D12): an
// @Audited() endpoint whose service did not emit or skip, or emitted an action it did not declare,
// answers 500, so every integration test of such an endpoint fails until the service is fixed.
let t: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
});
afterAll(async () => {
  await t.close();
});

async function call(path: string) {
  const requestId = randomUUID();
  t.logs.length = 0;
  const res = await t.http.post(`/api/v1/_fixtures/${path}`).set('X-Request-Id', requestId);
  const rows = await prisma.audit_events.count({ where: { request_id: requestId } });
  const logged = t.logs.filter((line) => line.level === 50).map((line) => line.err) as {
    message?: string;
  }[];
  return { res, rows, logged: logged.map((err) => err.message ?? '') };
}

describe('the @Audited() intent check (task 2.5)', () => {
  it('a handler whose service runs no transaction answers 500', async () => {
    const { res, rows, logged } = await call('audited-no-run');
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'internal_error' });
    expect(rows).toBe(0);
    expect(logged).toStrictEqual([expect.stringMatching(/neither emitted nor skipped/)]);
  });

  it('a service that neither emits nor skips answers 500', async () => {
    const { res, rows, logged } = await call('audited-silent');
    expect(res.status).toBe(500);
    expect(rows).toBe(0);
    expect(logged).toStrictEqual([expect.stringMatching(/neither emitted nor skipped/)]);
  });

  it('an emitted action the decorator does not declare answers 500 and writes nothing', async () => {
    const { res, rows, logged } = await call('audited-undeclared');
    expect(res.status).toBe(500);
    expect(rows).toBe(0);
    expect(logged).toStrictEqual([
      expect.stringMatching(/fixture\.not_declared is not declared by @Audited/),
    ]);
  });

  it('a skip passes the check and writes nothing', async () => {
    const { res, rows } = await call('audited-skip');
    expect(res.status).toBe(200);
    expect(rows).toBe(0);
  });
});
