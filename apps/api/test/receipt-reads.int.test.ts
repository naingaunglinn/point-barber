import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import { ErrorCode, type ReceiptViewDto } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { ProblemException } from '../src/common/http/problem.exception.js';
import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  StorageService,
} from '../src/modules/platform/index.js';
import { type ReceiptFile, ReceiptReads } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_MIN } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 9.13 / 9.14, the service behind the endpoints (P4.RCP.01 / .02 ·
// D-PAY-06 · P4-RULE-18 · sales-checkout spec "The receipt is rendered once, stored, and identical on
// every reopen"): the stored file streamed byte for byte, rendered and stored on the first read when the
// job has not run, another width rendered and not stored, `format=json` built now, 409 for an OPEN sale,
// 404 for no row. The endpoints, their access decorator and the read-scope 404 come with Dev 2's PR 2.
const { services, branches } = FIXTURE_IDS;

const storage = new InMemoryStorageService();
const renderer = new InMemoryDocumentRenderer();
let s: SeededApp;
let prisma: PrismaService;
let reads: ReceiptReads;
let saleId: string;
let refundId: string;
let openId: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), {
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
    ],
  });
  prisma = s.app.get(PrismaService);
  reads = s.app.get(ReceiptReads);
  const walkin = checkout(s.app);
  const cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  const kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
  // B3-2026-OCT-00001 — Ko Aung, Haircut 10,000, Cash.
  const a = await walkin.start(KO_AUNG, [services.HAIRCUT]);
  await walkin.pay(KO_AUNG, a.saleId, { payment_method_id: cash, amount: 10000 });
  await walkin.complete(KO_AUNG, a.visitId);
  await walkin.finish(KO_AUNG, a.saleId, { expected_total_amount: 10000 });
  saleId = a.saleId;
  // B3-2026-OCT-00002 with the change return B3-RF-2026-OCT-00001 (KBZPay 10,000 on 8,000).
  const b = await walkin.start(KO_MIN, [services.HAIRCUT]);
  await walkin.pay(KO_MIN, b.saleId, {
    payment_method_id: kbzpay,
    amount: 10000,
    external_reference: 'KBZ0001234591',
  });
  await walkin.complete(KO_MIN, b.visitId);
  await walkin.finish(KO_MIN, b.saleId, { expected_total_amount: 8000 });
  refundId = (await prisma.refunds.findFirstOrThrow({ where: { sale_id: b.saleId } })).id;
  openId = (await walkin.start(KO_AUNG, [services.SHAVE])).saleId;
}, 90_000);
afterAll(() => s.close());

async function bytes(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const file = async (pending: Promise<ReceiptViewDto | ReceiptFile>) => {
  const result = (await pending) as ReceiptFile;
  return { ...result, bytes: await bytes(result.body) };
};
const rowsOf = (entityType: string, entityId: string) =>
  prisma.attachments.count({ where: { entity_type: entityType, entity_id: entityId } });

describe('Sale receipt (task 9.13)', () => {
  it('Scenario: Opened before the job ran — rendered, stored, and the PDF returned', async () => {
    const pdf = await file(reads.ofSale(saleId, 'pdf'));
    expect([pdf.mime_type, pdf.file_name, pdf.size_bytes]).toStrictEqual([
      'application/pdf',
      'B3-2026-OCT-00001.pdf',
      pdf.bytes.length,
    ]);
    expect(await rowsOf('sales', saleId)).toBe(2);
    expect(renderer.calls.at(-1)).toMatchObject({ kind: 'png', width: 384 });
  });

  it('Scenario: Identical on reopen — the same bytes, nothing rendered again', async () => {
    const first = await file(reads.ofSale(saleId, 'pdf'));
    const calls = renderer.calls.length;
    const again = await file(reads.ofSale(saleId, 'pdf'));
    expect([sha(again.bytes), renderer.calls.length]).toStrictEqual([sha(first.bytes), calls]);
  });

  it('Scenario: PNG for the 58 mm printer — the stored image/png', async () => {
    const png = await file(reads.ofSale(saleId, 'png', 58));
    expect([png.mime_type, png.file_name]).toStrictEqual(['image/png', 'B3-2026-OCT-00001.png']);
    expect(png.bytes.toString()).toContain('384px');
  });

  it('another width: rendered now at 576 px, not stored', async () => {
    const png = await file(reads.ofSale(saleId, 'png', 80));
    expect(png.bytes.toString()).toContain('576px');
    expect(await rowsOf('sales', saleId)).toBe(2);
  });

  it('Scenario: Identical after the branch address changes — the stored file; json shows the new address', async () => {
    const before = await file(reads.ofSale(saleId, 'pdf'));
    await prisma.branches.update({
      where: { id: branches.B3 },
      data: { address_en: 'No. 9, Changed Road' },
    });
    const after = await file(reads.ofSale(saleId, 'pdf'));
    expect(sha(after.bytes)).toBe(sha(before.bytes));
    const view = (await reads.ofSale(saleId, 'json')) as ReceiptViewDto;
    expect(view.branch.address).toBe('No. 9, Changed Road');
    expect(view.pdf_attachment_id).not.toBeNull();
  });

  it('Scenario: Receipt of an open sale — 409 invalid_transition', async () => {
    const error = await reads.ofSale(openId, 'pdf').catch((e: unknown) => e);
    expect([(error as ProblemException).code, (error as ProblemException).status]).toStrictEqual([
      ErrorCode.INVALID_TRANSITION,
      409,
    ]);
  });

  it('no sale → 404 not_found', async () => {
    const error = await reads.ofSale(randomUUID(), 'json').catch((e: unknown) => e);
    expect([(error as ProblemException).code, (error as ProblemException).status]).toStrictEqual([
      ErrorCode.NOT_FOUND,
      404,
    ]);
  });
});

describe('Refund receipt (task 9.14)', () => {
  it('PDF stored under the refund; JSON of the change return', async () => {
    const pdf = await file(reads.ofRefund(refundId, 'pdf'));
    expect(pdf.file_name).toBe('B3-RF-2026-OCT-00001.pdf');
    expect(await rowsOf('refunds', refundId)).toBe(2);
    const view = (await reads.ofRefund(refundId, 'json')) as ReceiptViewDto;
    expect([view.kind, view.number, view.original_number, view.lines]).toStrictEqual([
      'refund',
      'B3-RF-2026-OCT-00001',
      'B3-2026-OCT-00002',
      [],
    ]);
  });

  it('no refund → 404 not_found', async () => {
    const error = await reads.ofRefund(randomUUID(), 'pdf').catch((e: unknown) => e);
    expect((error as ProblemException).status).toBe(404);
  });
});
