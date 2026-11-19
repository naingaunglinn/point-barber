import { AuditSource, PERMISSIONS } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { startTestApp } from './helpers/test-app.js';

// add-foundation-auth-access task 3.5 — ADR-002 · D-ROLE-08 · design D9 · D10: the job
// `sync.code_tables` is sent at every API start (singleton key) and runs the catalogue sync, then the
// base seed. Access spec scenarios "First start" and "Second start changes nothing", through a real
// pg-boss with the workers on.
let db: FreshDatabase;
beforeAll(async () => {
  db = await freshDatabase();
});
afterAll(async () => {
  await db.drop();
});

async function completedRuns(prisma: PrismaService): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM pgboss.job WHERE name = 'sync.code_tables' AND state = 'completed'`;
  return Number(rows[0]?.n ?? 0);
}

/** Starts the API on the fresh database and waits until this start's job has completed. */
async function start(run: number) {
  const t = await startTestApp({ databaseUrl: db.url, jobs: true });
  const prisma = t.app.get(PrismaService);
  const end = Date.now() + 20_000;
  while ((await completedRuns(prisma)) < run) {
    if (Date.now() > end) throw new Error(`sync.code_tables run ${run} did not complete`);
    await new Promise((done) => setTimeout(done, 250));
  }
  return { t, prisma };
}

describe('the sync.code_tables job at every start (task 3.5)', () => {
  it('Scenario: First start · Second start changes nothing', async () => {
    const first = await start(1);
    expect(await first.prisma.permissions.count({ where: { archived_at: null } })).toBe(
      PERMISSIONS.length,
    );
    expect(await first.prisma.roles.count()).toBe(3);
    const before = await first.prisma.permissions.findMany({
      select: { code: true, updated_at: true },
      orderBy: { code: 'asc' },
    });
    await first.t.close();

    const second = await start(2);
    expect(await second.prisma.permissions.count()).toBe(PERMISSIONS.length);
    expect(await second.prisma.roles.count()).toBe(3);
    expect(
      await second.prisma.permissions.findMany({
        select: { code: true, updated_at: true },
        orderBy: { code: 'asc' },
      }),
    ).toStrictEqual(before);
    const sync = await second.prisma.audit_events.findMany({
      where: { action: 'permission.sync' },
    });
    expect(sync).toMatchObject([
      {
        source: AuditSource.SYSTEM_JOB,
        actor_user_id: null,
        branch_id: null,
        entity_type: 'permissions',
      },
    ]);
    expect((sync[0]?.after_data as { created: string[] }).created).toHaveLength(PERMISSIONS.length);
    await second.t.close();
  }, 60_000);
});
