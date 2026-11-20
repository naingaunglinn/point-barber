import { AuditSource, LeaveStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LT, TRAINING, leaveRow } from './helpers/leave-types.js';
import { type SeededApp, startSeededApp } from './helpers/seeded.js';

// add-leave-types tasks 2.7 and 2.10 — leave spec "A leave type is archived only while no PENDING leave
// uses it" and "Every committed leave-type write leaves one audit row" (P2.LVT.04 · D-DAT-05 ·
// API-IDEM-01 · P2-RULE-12 · API-AUD-01 · design D5 / D7). U Kyaw Zin on Monday 05/Oct/2026; the leave
// rows are written by the builder (the leave endpoints come with add-leave-requests).
// The scenarios run in file order and share one app: Training is created in the first and archived
// in it, and the later ones read that state. Run the file whole, never a single case.
const at = (time: string) => new Date(`2026-10-05T${time}+06:30`);
let t: SeededApp;
let kyawZin: { readonly cookie: string; readonly sessionId: string };
let training = '';

beforeAll(async () => {
  t = await startSeededApp({ now: at('09:30:00') });
  kyawZin = await t.signIn('E001');
});
afterAll(async () => {
  await t.close();
});

const call = (method: 'post' | 'patch', path: string, body: object = {}) =>
  t.http[method](`/api/v1/leave-types${path}`).set('Cookie', kyawZin.cookie).send(body);
const archive = (id: string) => call('post', `/${id}/archive`);
const typeOf = (id: string) => t.prisma.leave_types.findUniqueOrThrow({ where: { id } });
const auditRows = (entityId: string) =>
  t.prisma.audit_events.findMany({
    where: { entity_id: entityId },
    orderBy: { occurred_at: 'asc' },
  });

describe('add-leave-types · leave · Every committed leave-type write leaves one audit row', () => {
  it('Scenario: Create, edit, archive', async () => {
    const created = await call('post', '', TRAINING);
    training = (created.body as { id: string }).id;
    t.clock?.set(at('09:45:00'));
    const edited = await call('patch', `/${training}`, {
      name_en: 'Training course',
      expected_updated_at: (created.body as { updated_at: string }).updated_at,
    });
    expect(edited.status).toBe(200);
    t.clock?.set(at('10:00:00'));
    expect((await archive(training)).status).toBe(200);
    const rows = await auditRows(training);
    expect(rows.map((row) => row.action)).toStrictEqual([
      'leave_type.create',
      'leave_type.update',
      'leave_type.archive',
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        source: AuditSource.APP,
        entity_type: 'leave_types',
        branch_id: null,
        actor_user_id: FIXTURE_IDS.users.E001,
        actor_session_id: kyawZin.sessionId,
      });
    }
    expect(rows[0]).toMatchObject({ before_data: null, after_data: { name_mm: TRAINING.name_mm } });
    expect(rows[1]).toMatchObject({
      before_data: { name_en: 'Training' },
      after_data: { name_en: 'Training course' },
    });
  });
});

describe('add-leave-types · leave · A leave type is archived only while no PENDING leave uses it', () => {
  it('Scenario: An unused type — Training, archived at 10:00 AM, leaves the list', async () => {
    const stored = await typeOf(training);
    expect(stored.archived_at).toStrictEqual(at('10:00:00'));
    const list = await t.http.get('/api/v1/leave-types').set('Cookie', kyawZin.cookie);
    expect((list.body as { items: { id: string }[] }).items.map((item) => item.id)).not.toContain(
      training,
    );
  });

  it('Scenario: Archive twice — 200 with the first archived_at and one audit row', async () => {
    t.clock?.set(at('10:05:00'));
    const res = await archive(training);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ archived_at: '2026-10-05T10:00:00+06:30' });
    const archives = (await auditRows(training)).filter(
      (row) => row.action === 'leave_type.archive',
    );
    expect(archives).toHaveLength(1);
  });

  it('Scenario: A pending leave blocks the archive · A refused archive writes nothing', async () => {
    await leaveRow(t.prisma, {
      employee: 'E005',
      typeId: LT.SICK_LEAVE,
      status: LeaveStatus.PENDING,
      start: '2026-10-06',
    });
    const res = await archive(LT.SICK_LEAVE);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'leave_type_in_use' });
    expect((await typeOf(LT.SICK_LEAVE)).archived_at).toBeNull();
    expect(await auditRows(LT.SICK_LEAVE)).toStrictEqual([]);
  });

  it('Scenario: Decided and cancelled leaves do not block', async () => {
    const leaves = [
      await leaveRow(t.prisma, {
        employee: 'E004',
        typeId: LT.PAID_LEAVE,
        status: LeaveStatus.APPROVED,
        start: '2026-10-08',
      }),
      await leaveRow(t.prisma, {
        employee: 'E005',
        typeId: LT.PAID_LEAVE,
        status: LeaveStatus.CANCELLED,
        start: '2026-10-07',
      }),
    ];
    expect((await archive(LT.PAID_LEAVE)).status).toBe(200);
    const kept = await t.prisma.leaves.findMany({ where: { id: { in: leaves } } });
    expect(kept.map((leave) => leave.leave_type_id)).toStrictEqual([LT.PAID_LEAVE, LT.PAID_LEAVE]);
  });

  it('an unknown id → 404 not_found', async () => {
    const res = await archive('0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: 'not_found' });
  });
});
