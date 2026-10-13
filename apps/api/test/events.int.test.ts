import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { type DomainEvent, DomainEvents } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 2.2 — in-process events (ADR-001 rule 1 · design D1 · D3): collected
// during run(), delivered after commit, never after a rollback.
let t: TestApp;
let runner: TransactionRunner;
let events: DomainEvents;
let background: BackgroundTasks;
let prisma: PrismaService;
const received: { event: DomainEvent; xactStatus: string }[] = [];
let xid = '';

beforeAll(async () => {
  t = await startTestApp();
  runner = t.app.get(TransactionRunner);
  events = t.app.get(DomainEvents);
  background = t.app.get(BackgroundTasks);
  prisma = t.app.get(PrismaService);
  events.on('fixture.happened', async (event) => {
    // When a handler runs, the transaction that collected the event has committed.
    const rows = await prisma.$queryRaw<{ s: string }[]>`
      SELECT pg_xact_status(${xid}::xid8)::text AS s`;
    received.push({ event, xactStatus: rows[0]?.s ?? '' });
  });
});
afterAll(async () => {
  await t.close();
});

async function currentXid(tx: Parameters<Parameters<TransactionRunner['run']>[0]>[0]) {
  const rows = await tx.$queryRaw<{ x: string }[]>`SELECT pg_current_xact_id()::text AS x`;
  return rows[0]?.x ?? '';
}

describe('in-process events (task 2.2)', () => {
  it('are delivered after commit, once', async () => {
    received.length = 0;
    await runner.run(async (tx) => {
      xid = await currentXid(tx);
      events.collect({ name: 'fixture.happened', payload: { n: 1 } });
      expect(received).toHaveLength(0);
    });
    await background.drain();
    expect(received).toStrictEqual([
      { event: { name: 'fixture.happened', payload: { n: 1 } }, xactStatus: 'committed' },
    ]);
  });

  it('are not delivered at all after a rollback', async () => {
    received.length = 0;
    await expect(
      runner.run(async (tx) => {
        xid = await currentXid(tx);
        events.collect({ name: 'fixture.happened', payload: { n: 2 } });
        throw new Error('rule failed');
      }),
    ).rejects.toThrow('rule failed');
    await background.drain();
    expect(received).toStrictEqual([]);
  });

  it('cannot be collected outside a transaction', () => {
    expect(() => events.collect({ name: 'fixture.happened', payload: {} })).toThrow(
      /inside TransactionRunner\.run/,
    );
  });

  it('a nested run() is refused — one business action, one transaction', async () => {
    await expect(runner.run(() => runner.run(() => Promise.resolve(1)))).rejects.toThrow(
      /already inside TransactionRunner\.run/,
    );
  });
});
