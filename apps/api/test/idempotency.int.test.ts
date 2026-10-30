import { randomUUID } from 'node:crypto';

import { AuditSource } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { idempotencyLatch } from './fixtures/idempotent-rows.controller.js';
import { ensureIdempotentRowsTable } from './helpers/fixtures-schema.js';
import { createBranch, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.13 — platform-runtime spec, the four idempotency requirements
// (API-IDEM-01 · API-IDEM-02 · D-VIS-10 · D-DB-12 · design D14), and the audit spec scenario "A
// replayed request writes no second row". Every test uses its own key, so runs never collide.
let t: TestApp;
let prisma: PrismaService;
let b1: string;
let b3: string;

beforeAll(async () => {
  await ensureIdempotentRowsTable();
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
  const company = await testCompany(prisma);
  b1 = await createBranch(prisma, company);
  b3 = await createBranch(prisma, company);
});
afterAll(async () => {
  await t.close();
});

const PATH = '/api/v1/_fixtures/idempotent-rows';
const post = (body: object, key?: string) => {
  const request = t.http.post(PATH).send(body);
  return key === undefined ? request : request.set('Idempotency-Key', key);
};

async function rowsFor(key: string) {
  return prisma.$queryRaw<{ id: string; amount: number; note: string | null }[]>`
    SELECT id, amount, note FROM fixtures.idempotent_rows WHERE client_request_id = ${key}::uuid`;
}
async function rowsWithBranch(branch: string) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM fixtures.idempotent_rows WHERE branch_id = ${branch}::uuid`;
  return Number(rows[0]?.n ?? 0);
}

describe('add-foundation-auth-access · platform-runtime · A row-creating endpoint requires the Idempotency-Key header', () => {
  it('Scenario: Header missing', async () => {
    const branch = await createBranch(prisma, await testCompany(prisma));
    const res = await post({ branch_id: branch, amount: 8000 });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'idempotency_key_required' });
    expect(await rowsWithBranch(branch)).toBe(0);
  });

  it('Scenario: Header is not a UUID', async () => {
    const branch = await createBranch(prisma, await testCompany(prisma));
    const res = await post({ branch_id: branch, amount: 8000 }, 'sale-42');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'Idempotency-Key' }] });
    expect(await rowsWithBranch(branch)).toBe(0);
  });

  it('a UUID of another version than 4 or 7 is not accepted either', async () => {
    const res = await post({ branch_id: b3, amount: 8000 }, '0199a3f2-7c1e-1b3a-9d4e-2f6a8c1b5e70');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', errors: [{ field: 'Idempotency-Key' }] });
  });

  it('Scenario: First request with a key creates the row', async () => {
    const key = randomUUID();
    const res = await post({ branch_id: b3, amount: 8000 }, key);
    expect(res.status).toBe(201);
    expect(res.headers['idempotent-replayed']).toBeUndefined();
    expect(res.body).toMatchObject({ client_request_id: key, amount: 8000 });
    expect(await rowsFor(key)).toMatchObject([{ amount: 8000 }]);
  });
});

describe('add-foundation-auth-access · platform-runtime · A repeat with the same key returns the first result and creates nothing', () => {
  it('Scenario: Double tap · A retry hours later is still a replay · A field that is not identifying may differ', async () => {
    const key = randomUUID();
    const first = await post({ branch_id: b3, amount: 8000 }, key);
    expect(first.status).toBe(201);

    const second = await post({ branch_id: b3, amount: 8000 }, key);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body).toStrictEqual(first.body);

    // The key has no expiry: a later retry is still the same request.
    const third = await post({ branch_id: b3, amount: 8000 }, key);
    expect(third.status).toBe(200);
    expect(third.body).toStrictEqual(first.body);

    const withNote = await post({ branch_id: b3, amount: 8000, note: 'retry' }, key);
    expect(withNote.status).toBe(200);
    expect(withNote.headers['idempotent-replayed']).toBe('true');
    expect(withNote.body).toStrictEqual(first.body);

    expect(await rowsFor(key)).toStrictEqual([{ id: first.body.id, amount: 8000, note: null }]);
  });
});

describe('add-foundation-auth-access · platform-runtime · A repeat that arrives while the first request is still running is refused', () => {
  it('Scenario: Two requests at the same moment', async () => {
    const key = randomUUID();
    let entered!: () => void;
    const inside = new Promise<void>((done) => {
      entered = done;
    });
    let release!: () => void;
    idempotencyLatch.hold = { entered, release: new Promise((done) => (release = done)) };
    const first = post({ branch_id: b3, amount: 8000 }, key).then((res) => res);
    await inside;
    idempotencyLatch.hold = undefined;

    const second = await post({ branch_id: b3, amount: 8000 }, key);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: 'idempotency_in_progress' });

    release();
    expect((await first).status).toBe(201);
    const third = await post({ branch_id: b3, amount: 8000 }, key);
    expect(third.status).toBe(200);
    expect(third.headers['idempotent-replayed']).toBe('true');
    expect(await rowsFor(key)).toHaveLength(1);
  });

  it('a unique violation on client_request_id inside create answers 409; the retry replays', async () => {
    const key = randomUUID();
    idempotencyLatch.collide = true;
    const res = await post({ branch_id: b3, amount: 8000 }, key);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'idempotency_in_progress' });
    const retry = await post({ branch_id: b3, amount: 8000 }, key);
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await rowsFor(key)).toHaveLength(1);
  });
});

describe('add-foundation-auth-access · platform-runtime · The same key with different identifying fields is refused', () => {
  it('Scenario: Same key, another amount · Same key, another branch', async () => {
    const key = randomUUID();
    expect((await post({ branch_id: b3, amount: 8000 }, key)).status).toBe(201);

    const amount = await post({ branch_id: b3, amount: 10000 }, key);
    expect(amount.status).toBe(422);
    expect(amount.body).toMatchObject({ code: 'idempotency_mismatch' });

    const branch = await post({ branch_id: b1, amount: 8000 }, key);
    expect(branch.status).toBe(422);
    expect(branch.body).toMatchObject({ code: 'idempotency_mismatch' });

    expect(await rowsFor(key)).toMatchObject([{ amount: 8000 }]);
  });

  it('Scenario: No key table exists', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
    expect(rows).toHaveLength(91);
    expect(rows.map((row) => row.table_name)).not.toContain('idempotency_keys');
  });
});

describe('add-foundation-auth-access · audit · Each action endpoint writes one application audit row with the branch it acted on', () => {
  it('Scenario: A replayed request writes no second row', async () => {
    const key = randomUUID();
    const first = await post({ branch_id: b3, amount: 8000 }, key);
    const replay = await post({ branch_id: b3, amount: 8000 }, key);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(
      await prisma.audit_events.findMany({
        where: { entity_id: first.body.id, source: AuditSource.APP },
        select: { action: true, branch_id: true },
      }),
    ).toStrictEqual([{ action: 'fixture.idempotent_row', branch_id: b3 }]);
  });
});
