import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adminCreate } from '../src/cli/admin-create-command.js';
import { pilotSeed } from '../src/cli/pilot-seed-command.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { CodeTables } from '../src/modules/platform/index.js';
import { type FreshDatabase, freshDatabase } from './helpers/databases.js';
import { latestCode, requestCode, sessionCookieOf, verify } from './helpers/sign-in.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-pilot-data-seed task 4.1 — the pilot flow on seeded data, through the HTTP API (brief S2 ·
// spec "A pilot barber signs in", "Prices and the lines of a walk-in", "A narrowed person", "The
// pattern is checked at checkout"): the example file applied on a pilot database at 7:30 AM, then
// Example Barber One signs in with the e-mail code at 9:05 AM (Google in the pilot).

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const EXAMPLE = JSON.parse(readFileSync(join(ROOT, 'db/pilot/pilot-data.example.json'), 'utf8'));
const API = '/api/v1';

let db: FreshDatabase;
let t: TestApp;
let prisma: PrismaService;

beforeEach(async () => {
  db = await freshDatabase();
  t = await startTestApp({ databaseUrl: db.url, now: new Date('2026-10-05T07:30:00+06:30') });
  prisma = t.app.get(PrismaService);
});
afterEach(async () => {
  await t.close();
  await db.drop();
});

async function seeded(change?: (data: any) => void) {
  await t.app.get(CodeTables).runAll();
  await adminCreate(
    t.app,
    ['--email', 'owner.one@example.com', '--name-mm', 'နမူနာ ပိုင်ရှင်', '--code', 'X00'],
    'node',
  );
  const data = structuredClone(EXAMPLE);
  change?.(data);
  const result = await pilotSeed(t.app, ['--apply'], JSON.stringify(data), 'node');
  expect(result.status).toBe(0);
  t.clock?.set(new Date('2026-10-05T09:05:00+06:30'));
  const id = async (table: 'branches' | 'services', where: object) =>
    (
      (await (prisma[table] as any).findFirstOrThrow({ where, select: { id: true } })) as {
        id: string;
      }
    ).id;
  return {
    branch: await id('branches', { code: 'PX1' }),
    cut: await id('services', { name_en: 'Example Cut' }),
    shave: await id('services', { name_en: 'Example Shave' }),
  };
}

async function signIn(email: string): Promise<string> {
  expect((await requestCode(t, email)).status).toBe(202);
  const code = await latestCode(t, email);
  if (code === undefined) throw new Error(`no code was sent to ${email}`);
  const res = await verify(t, email, code);
  expect(res.status).toBe(200);
  const cookie = sessionCookieOf(res);
  if (cookie === undefined) throw new Error('no session cookie');
  return `point_session=${cookie}`;
}

const post = (cookie: string, path: string, body: object, key = randomUUID()) =>
  t.http.post(`${API}${path}`).set('Cookie', cookie).set('Idempotency-Key', key).send(body);

async function walkIn(cookie: string, branch: string) {
  const res = await post(cookie, '/visits', { branch_id: branch, items: [] });
  expect(res.status).toBe(201);
  return res.body.sale.id as string;
}
const addLine = (cookie: string, saleId: string, serviceId: string) =>
  post(cookie, `/sales/${saleId}/items`, { line_type: 1, service_id: serviceId });

describe('add-pilot-data-seed · task 4.1 · the pilot flow on seeded data (brief S2)', () => {
  it('Scenario: A pilot barber signs in · Prices and the lines of a walk-in · The pattern is checked at checkout', async () => {
    const ids = await seeded();
    const one = await signIn('barber.one@example.com');

    const user = await prisma.users.findFirstOrThrow({
      where: { email: 'barber.one@example.com' },
    });
    expect(user.status).toBe(1);
    expect(user.activated_at?.toISOString()).toBe('2026-10-05T02:35:00.000Z');

    const me = await t.http.get(`${API}/me`).set('Cookie', one);
    expect(me.status).toBe(200);
    expect(me.body.branches_in_scope.map((b: { id: string }) => b.id)).toStrictEqual([ids.branch]);
    expect(me.body.grants).toContainEqual({
      code: 'sale.create',
      scope_type: 2,
      branch_ids: [ids.branch],
    });

    const saleId = await walkIn(one, ids.branch);
    const cut = await addLine(one, saleId, ids.cut);
    expect(cut.status).toBe(200);
    expect(cut.body.items[0].unit_price_amount).toBe(6_000); // X01's barber price
    const shave = await addLine(one, saleId, ids.shave);
    expect(shave.status).toBe(200);
    expect(shave.body).toMatchObject({ total_amount: 8_500, warnings: [] });

    const kbzpay = await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } });
    const pay = (reference: string) =>
      post(one, `/sales/${saleId}/payments`, {
        payment_method_id: kbzpay.id,
        amount: 8_500,
        external_reference: reference,
      });
    const wrong = await pay('EX1234');
    expect(wrong.status).toBe(422);
    expect(wrong.body.code).toBe('reference_format');
    expect((await pay('EX12345678')).status).toBe(201);
  });

  it('Example Barber Two sells Example Cut at the branch price, 5,000', async () => {
    const ids = await seeded();
    const two = await signIn('barber.two@example.com');
    const saleId = await walkIn(two, ids.branch);
    const cut = await addLine(two, saleId, ids.cut);
    expect(cut.status).toBe(200);
    expect(cut.body.items[0].unit_price_amount).toBe(5_000);
  });

  it('Scenario: A narrowed person — X02 without Example Shave gets not_eligible, still recorded', async () => {
    const cutName = EXAMPLE.categories[0].services[0].name_mm;
    const ids = await seeded((d) => (d.people[1].services = [cutName]));
    const two = await signIn('barber.two@example.com');
    const saleId = await walkIn(two, ids.branch);
    const shave = await addLine(two, saleId, ids.shave);
    expect(shave.status).toBe(200);
    expect(shave.body.warnings).toContainEqual({
      code: 'not_eligible',
      params: { service_id: ids.shave },
    });
  });
});

describe('add-pilot-data-seed · task 4.1 · what START and the quote show (review of #33, item 7)', () => {
  it('Scenario: Two categories keep the file order — the START list (SIMPLE services at PX1) is Cut, Shave, Wash', async () => {
    const ids = await seeded((d) =>
      d.categories.push({
        name_mm: 'နမူနာ စောင့်ရှောက်မှု',
        name_en: 'Example Care',
        services: [
          {
            name_mm: 'နမူနာ ခေါင်းလျှော်',
            name_en: 'Example Wash',
            duration_minutes: 20,
            price: 1500,
          },
        ],
      }),
    );
    const one = await signIn('barber.one@example.com');
    const list = await t.http
      .get(`${API}/services?branch_id=${ids.branch}&pricing_mode=1&limit=100`)
      .set('Cookie', one);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { name_en: string }) => item.name_en)).toStrictEqual([
      'Example Cut',
      'Example Shave',
      'Example Wash',
    ]);
  });

  it('the quote: X01 Example Cut 6,000 from the barber price (2), X02 5,000 from the branch price (1)', async () => {
    const ids = await seeded();
    const one = await signIn('barber.one@example.com');
    const employees = await prisma.employees.findMany({
      where: { employee_code: { in: ['X01', 'X02'] } },
      select: { id: true, employee_code: true },
    });
    const idOf = (code: string) => employees.find((e) => e.employee_code === code)?.id;
    for (const [code, price, source] of [
      ['X01', 6_000, 2],
      ['X02', 5_000, 1],
    ] as const) {
      const quote = await t.http
        .post(`${API}/prices/quote`)
        .set('Cookie', one)
        .send({
          branch_id: ids.branch,
          location_type: 1,
          date: '2026-10-05',
          employee_id: idOf(code),
          items: [{ service_id: ids.cut }],
        });
      expect(quote.status).toBe(200);
      expect(quote.body.items[0]).toMatchObject({ unit_price_amount: price, price_source: source });
    }
  });
});
