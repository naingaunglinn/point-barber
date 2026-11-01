import { createHash } from 'node:crypto';

import { ErrorCode, receiptViewSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  StorageService,
} from '../src/modules/platform/index.js';
import type { FixturePerson, SeededApp } from './helpers/seeded.js';
import { seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-walkin-visit-checkout tasks 9.13 / 9.14 — GET /v1/sales/{id}/receipt and GET /v1/refunds/{id}/receipt
// (P4.RCP.01 / .02 · P4-RULE-18 · API-SHAPE-05 · design D2 / D10): `@Staff()`, the branch in the read
// scope or 404; `format` json by default, the stored PDF / PNG in its own media type with
// Content-Disposition, byte-identical on every reopen; 409 for an OPEN sale. The renderer and the storage
// are the in-memory fakes (CG-ARCH-08); the service behind it is proven in receipt-reads.int.test.ts.
const { branches, services } = FIXTURE_IDS;
const AUNG = 'E004';
const MIN = 'E005';
const HTET = 'E006';

let s: SeededApp;
let api: WalkinHttp;
let saleId: string;
let refundId: string;
let openId: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), {
    overrides: [
      { provide: StorageService, useValue: new InMemoryStorageService() },
      { provide: DocumentRenderer, useValue: new InMemoryDocumentRenderer() },
    ],
  });
  api = walkinHttp(s);
  const prisma = s.app.get(PrismaService);
  const cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  const kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
  // B3-2026-OCT-00001 — Ko Aung, Haircut 10,000, Cash.
  const a = await api.start(AUNG, [services.HAIRCUT]);
  await api.complete(AUNG, a.id);
  await api.pay(AUNG, a.sale.id, { payment_method_id: cash, amount: 10_000 });
  await api.finish(AUNG, a.sale.id, { expected_total_amount: 10_000 });
  saleId = a.sale.id;
  // B3-2026-OCT-00002 with the change return B3-RF-2026-OCT-00001 (KBZPay 10,000 on 8,000).
  const b = await api.start(MIN, [services.HAIRCUT]);
  await api.complete(MIN, b.id);
  await api.pay(MIN, b.sale.id, {
    payment_method_id: kbzpay,
    amount: 10_000,
    external_reference: 'KBZ0001234591',
  });
  await api.finish(MIN, b.sale.id, { expected_total_amount: 8_000 });
  refundId = (await prisma.refunds.findFirstOrThrow({ where: { sale_id: b.sale.id } })).id;
  openId = (await api.start(MIN, [services.SHAVE])).sale.id;
}, 90_000);
afterAll(() => s.close());

/** The response body as bytes, whatever its media type. */
const binary = async (who: FixturePerson, path: string): Promise<Response> =>
  s.http
    .get(`/api/v1${path}`)
    .set('Cookie', await api.cookie(who))
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');

describe('GET /v1/sales/{id}/receipt (P4.RCP.01)', () => {
  it('format defaults to json — the ReceiptView of B3-2026-OCT-00001', async () => {
    const res = await api.get(AUNG, `/sales/${saleId}/receipt`);
    expect(res.status).toBe(200);
    expect(receiptViewSchema.parse(res.body)).toMatchObject({
      kind: 'sale',
      number: 'B3-2026-OCT-00001',
    });
  });

  it('Scenario: The same receipt at 10:43 AM and 4:00 PM — application/pdf, the same bytes', async () => {
    const first = await binary(AUNG, `/sales/${saleId}/receipt?format=pdf`);
    expect(first.status).toBe(200);
    expect(first.headers['content-type']).toMatch(/^application\/pdf/);
    expect(first.headers['content-disposition']).toMatch(/^inline; filename=".+\.pdf"$/);
    await s.app.get(PrismaService).branches.update({
      where: { id: branches.B3 },
      data: { address_en: 'No. 9, New Road, Yangon' },
    });
    s.clock?.set(new Date('2026-10-05T16:00:00+06:30'));
    const again = await binary(AUNG, `/sales/${saleId}/receipt?format=pdf`);
    expect(sha(again.body as Buffer)).toBe(sha(first.body as Buffer));
  });

  it('format=png is image/png; width 80 against the branch setting 58 is drawn now', async () => {
    const png = await binary(AUNG, `/sales/${saleId}/receipt?format=png`);
    expect([png.status, png.headers['content-type']]).toStrictEqual([200, 'image/png']);
    const wide = await binary(AUNG, `/sales/${saleId}/receipt?format=png&width=80`);
    expect(wide.status).toBe(200);
    expect(sha(wide.body as Buffer)).not.toBe(sha(png.body as Buffer));
    const bad = await api.get(AUNG, `/sales/${saleId}/receipt?format=png&width=70`);
    expect([bad.status, bad.body.code]).toStrictEqual([400, ErrorCode.VALIDATION]);
  });

  it('Scenario: A colleague opens the receipt — 200 application/pdf; Ko Htet (B1) → 404', async () => {
    const colleague = await binary(MIN, `/sales/${saleId}/receipt?format=pdf`);
    expect([colleague.status, colleague.headers['content-type']]).toStrictEqual([
      200,
      'application/pdf',
    ]);
    const other = await api.get(HTET, `/sales/${saleId}/receipt?format=pdf`);
    expect([other.status, other.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });

  it('an OPEN sale has no receipt — 409 invalid_transition', async () => {
    const res = await api.get(MIN, `/sales/${openId}/receipt?format=pdf`);
    expect([res.status, res.body.code]).toStrictEqual([409, ErrorCode.INVALID_TRANSITION]);
  });
});

describe('GET /v1/refunds/{id}/receipt (P4.RCP.02)', () => {
  it('the change return B3-RF-2026-OCT-00001 — JSON and PDF; Ko Htet → 404', async () => {
    const json = await api.get(MIN, `/refunds/${refundId}/receipt?format=json`);
    expect(json.status).toBe(200);
    expect(json.body).toMatchObject({
      kind: 'refund',
      number: 'B3-RF-2026-OCT-00001',
      original_number: 'B3-2026-OCT-00002',
    });
    const pdf = await binary(MIN, `/refunds/${refundId}/receipt?format=pdf`);
    expect([pdf.status, pdf.headers['content-type']]).toStrictEqual([200, 'application/pdf']);
    const other = await api.get(HTET, `/refunds/${refundId}/receipt?format=pdf`);
    expect([other.status, other.body.code]).toStrictEqual([404, ErrorCode.NOT_FOUND]);
  });
});
