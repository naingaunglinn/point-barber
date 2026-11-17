import { AuditSource, CancelReasonStatus, CancelReasonSystemCode } from '@point/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { CodeTables } from '../src/modules/platform/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-booking-cancel-reasons task 1.6 — booking spec "Every company starts with the four preset cancel
// reasons" (D-BKG-14 · D-BKG-17 · D-DB-07 · F-BK-17 · design D3): the base seed — the steps of
// sync.code_tables, step `cancel reasons` (40) — on a fresh database, a restart and after a rename. No
// fixture module runs here.
let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url });
  prisma = t.app.get(PrismaService);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

const NO_SHOW = CancelReasonSystemCode.NO_SHOW;
/** One run of the base seed — what every API start does (`sync.code_tables`). */
const start = () => t.app.get(CodeTables).runAll();
/** The rows as [name_mm, name_en, requires_note, system_code, sort_order, status, archived]. */
const reasons = async () =>
  (
    await prisma.booking_cancel_reasons.findMany({
      orderBy: [{ sort_order: 'asc' }, { name_mm: 'asc' }],
    })
  ).map((r) => [
    r.name_mm,
    r.name_en,
    r.requires_note,
    r.system_code,
    r.sort_order,
    r.status,
    r.archived_at !== null,
  ]);
const createRows = () =>
  prisma.audit_events.findMany({ where: { action: 'booking_cancel_reason.create' } });
const ACTIVE = CancelReasonStatus.ACTIVE;

describe('add-booking-cancel-reasons · booking · Every company starts with the four preset cancel reasons', () => {
  it('Scenario: A fresh database — 4 rows in order, one SYSTEM_JOB audit row each', async () => {
    await start();
    expect(await reasons()).toStrictEqual([
      ['Customer ပြောင်းချင်', 'Customer wants to change', false, null, 1, ACTIVE, false],
      ['Barber မအား', 'Barber not available', false, null, 2, ACTIVE, false],
      ['Customer မလာ', 'Customer no-show', false, NO_SHOW, 3, ACTIVE, false],
      ['Other', 'Other', true, null, 4, ACTIVE, false],
    ]);
    const company = await prisma.companies.findFirstOrThrow();
    const rows = await prisma.booking_cancel_reasons.findMany({
      select: { id: true, company_id: true, system_code: true },
    });
    expect(rows.every((r) => r.company_id === company.id)).toBe(true);

    const audit = await createRows();
    expect(audit).toHaveLength(4);
    for (const entry of audit)
      expect(entry).toMatchObject({
        source: AuditSource.SYSTEM_JOB,
        entity_type: 'booking_cancel_reasons',
        actor_user_id: null,
        branch_id: null,
      });
    // One row per inserted reason; written in one transaction, so compare as sets.
    expect(audit.map((entry) => entry.entity_id).sort()).toStrictEqual(
      rows.map((r) => r.id).sort(),
    );
    const noShow = rows.find((r) => r.system_code === NO_SHOW)?.id;
    expect(audit.find((entry) => entry.entity_id === noShow)?.after_data).toStrictEqual({
      name_mm: 'Customer မလာ',
      name_en: 'Customer no-show',
      requires_note: false,
      system_code: NO_SHOW,
      sort_order: 3,
      status: ACTIVE,
    });
  });

  it('Scenario: A restart adds nothing — still 4 rows, no new audit row', async () => {
    await start();
    const before = await prisma.booking_cancel_reasons.findMany({ orderBy: { id: 'asc' } });
    await start();
    expect(await prisma.booking_cancel_reasons.findMany({ orderBy: { id: 'asc' } })).toStrictEqual(
      before,
    );
    expect(await createRows()).toHaveLength(4);
  });

  it('Scenario: A renamed preset is kept — "Other" renamed to အခြား, then a restart', async () => {
    await start();
    await prisma.booking_cancel_reasons.updateMany({
      where: { name_mm: 'Other' },
      data: { name_mm: 'အခြား' },
    });
    await start();
    expect((await reasons()).map(([name]) => name)).toStrictEqual([
      'Customer ပြောင်းချင်',
      'Barber မအား',
      'Customer မလာ',
      'အခြား',
    ]);
    expect(await createRows()).toHaveLength(4);
  });

  it('a company with reasons but no system row gets the no-show row only, placed last', async () => {
    await start();
    // The state the planner's second branch covers: rows exist, none with system_code 1.
    await prisma.booking_cancel_reasons.deleteMany({ where: { system_code: NO_SHOW } });
    await start();
    expect((await reasons()).map(([name, , , code, sort]) => [name, code, sort])).toStrictEqual([
      ['Customer ပြောင်းချင်', null, 1],
      ['Barber မအား', null, 2],
      ['Other', null, 4],
      ['Customer မလာ', NO_SHOW, 5],
    ]);
    expect(await createRows()).toHaveLength(5);
  });
});
