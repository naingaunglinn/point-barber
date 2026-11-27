import { randomUUID } from 'node:crypto';

import { ErrorCode, LateEntryReason, UiLanguage, collectorListSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { Attendance } from '../src/modules/scheduling/index.js';
import { attendanceRecord, morningAtB3 } from './builders/attendance.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-payment-collector-picker tasks 1.3, 2.1 — `Attendance.openRecordsAt` and P4.SAL.14 (the collector
// list: D-VIS-06 · owner B3 · P5-RULE-18 · AD-L10N-03). 05/Oct/2026 10:41 AM at B3; Ko Aung (English UI)
// has Haircut 10,000. The late-entry scenario ends Ko Min's assignment, so it is last.
const { branches, employees, services, users } = FIXTURE_IDS;
const AUNG = 'E004';

let s: SeededApp;
let api: WalkinHttp;
let prisma: PrismaService;
let saleId: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:41:00+06:30'));
  api = walkinHttp(s);
  prisma = s.app.get(PrismaService);
  await prisma.users.update({ where: { id: users.E004 }, data: { ui_language: UiLanguage.EN } });
  saleId = (await api.start(AUNG, [services.HAIRCUT])).sale.id;
});
afterAll(() => s.close());

const list = async (who: 'E001' | 'E002' | 'E003' | 'E004' | 'E005', id = saleId) =>
  api.get(who, `/sales/${id}/collectors`);
const names = (body: unknown) => collectorListSchema.parse(body).items.map((i) => i.display_name);

describe('Attendance.openRecordsAt (P5-RULE-18 · owner CL1)', () => {
  it('no record yet — nobody is open', async () => {
    const open = await s.app.get(Attendance).openRecordsAt(prisma, branches.B3);
    expect(open).toStrictEqual([]);
  });

  it('open records of today at B3 by clock-in; a closed, a voided, a yesterday and another branch left out', async () => {
    await morningAtB3(prisma);
    await attendanceRecord(prisma, {
      who: 'E002',
      branch: branches.B3,
      in: '2026-10-05T08:00:00+06:30',
      out: '2026-10-05T09:00:00+06:30',
    });
    await attendanceRecord(prisma, {
      who: 'E008',
      branch: branches.B3,
      in: '2026-10-05T08:10:00+06:30',
      voided: true,
    });
    await attendanceRecord(prisma, {
      who: 'E008',
      branch: branches.B3,
      in: '2026-10-04T09:00:00+06:30',
    });
    const open = await s.app.get(Attendance).openRecordsAt(prisma, branches.B3);
    expect(open.map((r) => r.employee_id)).toStrictEqual([employees.E004, employees.E005]);
    expect(open.map((r) => r.clock_in_at.toISOString())).toStrictEqual([
      '2026-10-05T02:25:00.000Z',
      '2026-10-05T03:42:00.000Z',
    ]);
  });
});

describe('GET /v1/sales/{id}/collectors (P4.SAL.14)', () => {
  it('Scenario: Two people clocked in at B3 — Ko Aung, Ko Min, then by name; the default is Ko Aung', async () => {
    const res = await list('E004');
    expect(res.status).toBe(200);
    const { items } = collectorListSchema.parse(res.body);
    expect(items).toStrictEqual([
      { employee_id: employees.E004, display_name: 'Ko Aung', clocked_in: true, is_default: true },
      { employee_id: employees.E005, display_name: 'Ko Min', clocked_in: true, is_default: false },
      {
        employee_id: employees.E002,
        display_name: 'Ma Hnin',
        clocked_in: false,
        is_default: false,
      },
      {
        employee_id: employees.E008,
        display_name: 'Ma Thida',
        clocked_in: false,
        is_default: false,
      },
      {
        employee_id: employees.E001,
        display_name: 'U Kyaw Zin',
        clocked_in: false,
        is_default: false,
      },
    ]);
  });

  it('Scenario: People not assigned are not offered — Ko Htet (B1) and Ko Naing (left) are absent', async () => {
    const all = JSON.stringify((await list('E004')).body);
    expect(all).not.toContain(employees.E006);
    expect(all).not.toContain(employees.E009);
  });

  it('Scenario: Who may read the list — Ko Min 403, Ma Hnin 200, Ko Zaw (B1) 404', async () => {
    const own = await list('E005');
    expect(own.status).toBe(403);
    expect(own.body).toMatchObject({
      code: ErrorCode.FORBIDDEN,
      context: { required: 'sale.finish_override' },
    });
    expect((await list('E002')).status).toBe(200);
    const other = await list('E003');
    expect([other.status, other.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });

  it('a sale that does not exist — 404', async () => {
    expect((await list('E002', randomUUID())).status).toBe(404);
  });

  it('Scenario: Nobody clocked in — by name, Ko Aung the default (records closed)', async () => {
    await prisma.attendance_records.updateMany({
      where: {
        clock_out_at: null,
        voided_at: null,
        business_date: new Date('2026-10-05T00:00:00Z'),
      },
      data: { clock_out_at: new Date('2026-10-05T10:30:00+06:30'), clock_out_source: 1 },
    });
    const res = await list('E004');
    expect(names(res.body)).toStrictEqual([
      'Ko Aung',
      'Ko Min',
      'Ma Hnin',
      'Ma Thida',
      'U Kyaw Zin',
    ]);
    const { items } = collectorListSchema.parse(res.body);
    expect(items.map((i) => i.clocked_in)).toStrictEqual([false, false, false, false, false]);
    expect(items.map((i) => i.is_default)).toStrictEqual([true, false, false, false, false]);
  });

  it('a Myanmar UI orders by name_mm in code-point order', async () => {
    await prisma.users.update({ where: { id: users.E004 }, data: { ui_language: UiLanguage.MY } });
    const mm = names((await list('E004')).body);
    expect(mm).toStrictEqual([...mm].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(mm).toContain('ကိုအောင်');
    await prisma.users.update({ where: { id: users.E004 }, data: { ui_language: UiLanguage.EN } });
  });

  it('Scenario: The list of a late-entry sale — Ko Min (assignment ended 04/Oct) is on 04/Oct, not today', async () => {
    await prisma.employee_branches.updateMany({
      where: { employee_id: employees.E005, branch_id: branches.B3 },
      data: { effective_to: new Date('2026-10-04T00:00:00Z') },
    });
    const late = await api.post(
      AUNG,
      '/visits',
      {
        branch_id: branches.B3,
        items: [{ service_id: services.HAIRCUT }],
        late_entry: {
          reason: LateEntryReason.INTERNET_OUTAGE,
          started_at: '2026-10-04T10:00:00+06:30',
        },
      },
      randomUUID(),
    );
    expect(late.status).toBe(201);
    expect(names((await list('E004', late.body.sale.id)).body)).toContain('Ko Min');
    expect(names((await list('E004')).body)).not.toContain('Ko Min');
  });
});
