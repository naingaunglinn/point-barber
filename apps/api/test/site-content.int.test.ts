import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { TransactionRunner } from '../src/common/database/transaction-runner.js';
import { type DomainEvent, DomainEvents } from '../src/common/events/domain-events.js';
import { BackgroundTasks } from '../src/common/http/background-tasks.js';
import { SITE_CONTENT_CHANGED, SiteContent, type SiteTag } from '../src/modules/platform/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-company-profile task 2.9 — SiteContent.touch (API-PUB-03 · ADR-002 · ADR-006 · design D6): the
// queue `site.revalidate` exists after the one migrate step; a write queues one job with its tags and
// raises `site.content_changed` inside its transaction, so a rolled-back write leaves neither; a tag
// outside the site's cache tags is a programming error. On a fresh copy, so no other test's job counts.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let site: SiteContent;
const delivered: DomainEvent[] = [];

beforeAll(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  site = t.app.get(SiteContent);
  t.app.get(DomainEvents).on(SITE_CONTENT_CHANGED, (event) => {
    delivered.push(event);
  });
});
afterAll(async () => {
  await t.close();
  await db.drop();
});

const jobs = () =>
  prisma.$queryRaw<{ data: unknown }[]>`
    SELECT data FROM pgboss.job WHERE name = 'site.revalidate' ORDER BY created_on`;

describe('SiteContent.touch — the website refresh of every website write (API-PUB-03)', () => {
  it('the queue site.revalidate is created by the migrate step (ADR-002: 3 retries)', async () => {
    const [queue] = await prisma.$queryRaw<{ retry_limit: number }[]>`
      SELECT retry_limit FROM pgboss.queue WHERE name = 'site.revalidate'`;
    expect(queue?.retry_limit).toBe(3);
  });

  it('a committed write queues one job with its tags and raises site.content_changed', async () => {
    await runner.run((tx) => site.touch(tx, ['site', 'home']));
    await t.app.get(BackgroundTasks).drain();
    expect(await jobs()).toStrictEqual([{ data: { tags: ['site', 'home'] } }]);
    expect(delivered).toStrictEqual([
      { name: SITE_CONTENT_CHANGED, payload: { tags: ['site', 'home'] } },
    ]);
  });

  it('a rolled-back write leaves no job and no event', async () => {
    await expect(
      runner.run(async (tx) => {
        await site.touch(tx, ['branch:B3']);
        throw new Error('rolled back');
      }),
    ).rejects.toThrow('rolled back');
    await t.app.get(BackgroundTasks).drain();
    expect(await jobs()).toHaveLength(1);
    expect(delivered).toHaveLength(1);
  });

  // The type admits any `branch:<text>`; the run-time check holds it to the branch code pattern.
  it.each<[readonly SiteTag[]]>([[[]], [['branch:b3']], [['site', 'branch:']]])(
    'refuses %j — no tag, or not a cache tag of the site',
    async (tags) => {
      await expect(runner.run((tx) => site.touch(tx, tags))).rejects.toThrow('SiteContent.touch');
      expect(await jobs()).toHaveLength(1);
    },
  );
});
