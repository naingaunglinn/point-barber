import { randomUUID } from 'node:crypto';

import { AuditSource } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { RequestContext } from '../src/common/http/request-context.js';
import { Audit } from '../src/modules/platform/index.js';
import { type TestPerson, createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.3 — the audit writer (API-AUD-01 · D-AUD-01 · D-AUD-02 ·
// CG-SEC-10 · design D12): Audit.emit / skip / emitSystem fill the transaction's slot, the runner
// writes the rows just before commit; a rollback leaves none; secrets never reach a row.
const NOW = new Date('2026-10-05T11:30:00.000Z'); // 6:00:00 PM MMT
let t: TestApp;
let runner: TransactionRunner;
let audit: Audit;
let prisma: PrismaService;
let aung: TestPerson;

beforeAll(async () => {
  t = await startTestApp({ now: NOW });
  runner = t.app.get(TransactionRunner);
  audit = t.app.get(Audit);
  prisma = t.app.get(PrismaService);
  aung = await createPerson(prisma, await testCompany(prisma));
});
afterAll(async () => {
  await t.close();
});

const rowsOf = (requestId: string) =>
  prisma.audit_events.findMany({ where: { request_id: requestId }, orderBy: { id: 'asc' } });

function asAung<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return RequestContext.run(
    { request_id: requestId, user_id: aung.userId, session_id: aung.sessionId },
    fn,
  );
}

describe('Audit.emit and the runner flush (task 2.3)', () => {
  it('writes one source-1 row with the caller, the request and the clock time', async () => {
    const requestId = randomUUID();
    const entityId = randomUUID();
    await asAung(requestId, () =>
      runner.run(async () => {
        await audit.emit({
          action: 'fixture.update',
          entity_type: 'fixtures',
          entity_id: entityId,
          before: { name: 'old' },
          after: { name: 'new' },
          reason: 'fixture reason',
        });
      }),
    );
    const rows = await rowsOf(requestId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: AuditSource.APP,
      action: 'fixture.update',
      entity_type: 'fixtures',
      entity_id: entityId,
      actor_user_id: aung.userId,
      actor_session_id: aung.sessionId,
      branch_id: null,
      before_data: { name: 'old' },
      after_data: { name: 'new' },
      reason: 'fixture reason',
      request_id: requestId,
      occurred_at: NOW,
    });
    expect(rows[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('is written just before commit — not yet visible inside the work', async () => {
    const requestId = randomUUID();
    let inside = -1;
    await asAung(requestId, () =>
      runner.run(async (tx) => {
        await audit.emit({ action: 'fixture.update', entity_type: 'fixtures' });
        inside = await tx.audit_events.count({ where: { request_id: requestId } });
      }),
    );
    expect(inside).toBe(0);
    expect(await rowsOf(requestId)).toHaveLength(1);
  });

  it('leaves no row after a rollback', async () => {
    const requestId = randomUUID();
    await expect(
      asAung(requestId, () =>
        runner.run(async () => {
          await audit.emit({ action: 'fixture.update', entity_type: 'fixtures' });
          throw new Error('rule failed');
        }),
      ),
    ).rejects.toThrow('rule failed');
    expect(await rowsOf(requestId)).toHaveLength(0);
  });

  it('writes nothing for skip()', async () => {
    const requestId = randomUUID();
    await asAung(requestId, () =>
      runner.run(() => {
        audit.skip();
        return Promise.resolve();
      }),
    );
    expect(await rowsOf(requestId)).toHaveLength(0);
  });

  it('emitSystem writes source 3 with no actor', async () => {
    const requestId = randomUUID();
    await asAung(requestId, () =>
      runner.run(() => {
        audit.emitSystem({
          action: 'permission.sync',
          entity_type: 'permissions',
          after: { n: 1 },
        });
        return Promise.resolve();
      }),
    );
    expect(await rowsOf(requestId)).toMatchObject([
      {
        source: AuditSource.SYSTEM_JOB,
        action: 'permission.sync',
        actor_user_id: null,
        actor_session_id: null,
        branch_id: null,
        after_data: { n: 1 },
      },
    ]);
  });

  it('takes the actor from the event when the context has none (sign-in)', async () => {
    const requestId = randomUUID();
    await RequestContext.run({ request_id: requestId }, () =>
      runner.run(async () => {
        await audit.emit({
          action: 'login.success',
          entity_type: 'users',
          entity_id: aung.userId,
          actor_user_id: aung.userId,
          actor_session_id: aung.sessionId,
          after: { method: 'otp' },
        });
      }),
    );
    expect(await rowsOf(requestId)).toMatchObject([
      { actor_user_id: aung.userId, actor_session_id: aung.sessionId, branch_id: null },
    ]);
  });

  it('drops every secret key before the row is written (CG-SEC-10)', async () => {
    const requestId = randomUUID();
    const secrets = {
      token: 't',
      token_hash: 'th',
      code_hash: '48291735',
      google_subject: 'g',
      id_token: 'i',
      authorization_code: 'a',
      client_secret: 'cs',
      api_secret: 'as',
    };
    await asAung(requestId, () =>
      runner.run(async () => {
        await audit.emit({
          action: 'fixture.update',
          entity_type: 'fixtures',
          before: { ...secrets, kept: 1 },
          after: { method: 'otp', nested: { ...secrets, kept: 2 } },
        });
      }),
    );
    const [row] = await rowsOf(requestId);
    expect(row?.before_data).toStrictEqual({ kept: 1 });
    expect(row?.after_data).toStrictEqual({ method: 'otp', nested: { kept: 2 } });
    expect(JSON.stringify(row)).not.toMatch(/48291735/);
  });

  it('keeps a business code, as a branch or a payment method carries it', async () => {
    const requestId = randomUUID();
    await asAung(requestId, () =>
      runner.run(async () => {
        await audit.emit({
          action: 'fixture.update',
          entity_type: 'fixtures',
          before: { code: 'CASH', state: 1 },
          after: { code: 'KBZPAY', nested: { code: 'YGN-01' } },
        });
      }),
    );
    const [row] = await rowsOf(requestId);
    expect(row?.before_data).toStrictEqual({ code: 'CASH', state: 1 });
    expect(row?.after_data).toStrictEqual({ code: 'KBZPAY', nested: { code: 'YGN-01' } });
  });

  it('cannot be used outside a transaction', async () => {
    await expect(
      asAung(randomUUID(), () => audit.emit({ action: 'fixture.update', entity_type: 'fixtures' })),
    ).rejects.toThrow(/inside TransactionRunner\.run/);
    expect(() => audit.skip()).toThrow(/inside TransactionRunner\.run/);
  });
});
