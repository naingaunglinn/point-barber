import { randomUUID } from 'node:crypto';

import { ErrorCode, SaleStatus } from '@point/shared';
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
import { ReceiptFiles, ReceiptViews } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_MIN } from './helpers/walkin.js';

// add-walkin-visit-checkout tasks 9.9 / 9.10 — ReceiptView of a sale and of a refund (P4.RCP.01 / .02 ·
// AD-RCPT-01 · OPEN-32 · sales-checkout spec "The receipt is English with fixed content" and "rendered
// once, stored, and identical"): English whatever the caller's language, the masked phone, the change
// returned, the branch as it is now, the stored files' ids. The fixture day of the spec: B3, 05/Oct/2026.
const { services, branches } = FIXTURE_IDS;

const storage = new InMemoryStorageService();
const renderer = new InMemoryDocumentRenderer();
let s: SeededApp;
let prisma: PrismaService;
let views: ReceiptViews;
let walkin: ReturnType<typeof checkout>;
const ids = {} as Record<'aung' | 'split' | 'change' | 'open', string>;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), {
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
    ],
  });
  prisma = s.app.get(PrismaService);
  views = s.app.get(ReceiptViews);
  walkin = checkout(s.app);
  const cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  const kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;

  // B3-2026-OCT-00001 — Ko Aung, Haircut 10,000, Cash; the customer Ma Su.
  const a = await walkin.start(KO_AUNG, [services.HAIRCUT]);
  await walkin.pay(KO_AUNG, a.saleId, { payment_method_id: cash, amount: 10000 });
  await walkin.complete(KO_AUNG, a.visitId);
  await walkin.finish(KO_AUNG, a.saleId, {
    expected_total_amount: 10000,
    customer: { phone: '09 7712 3456' },
  });
  ids.aung = a.saleId;
  // B3-2026-OCT-00002 — Ko Min, Haircut 8,000 + Shave 3,000; Cash 5,000 + KBZPay 6,000.
  const b = await walkin.start(KO_MIN, [services.HAIRCUT, services.SHAVE]);
  await walkin.pay(KO_MIN, b.saleId, { payment_method_id: cash, amount: 5000 });
  await walkin.pay(KO_MIN, b.saleId, {
    payment_method_id: kbzpay,
    amount: 6000,
    external_reference: 'KBZ0001234567',
  });
  await walkin.complete(KO_MIN, b.visitId);
  await walkin.finish(KO_MIN, b.saleId, { expected_total_amount: 11000 });
  ids.split = b.saleId;
  // B3-2026-OCT-00003 — Ko Min, Haircut 8,000 paid by a KBZPay transfer of 10,000: 2,000 change.
  const c = await walkin.start(KO_MIN, [services.HAIRCUT]);
  await walkin.pay(KO_MIN, c.saleId, {
    payment_method_id: kbzpay,
    amount: 10000,
    external_reference: 'KBZ0001234568',
  });
  await walkin.complete(KO_MIN, c.visitId);
  await walkin.finish(KO_MIN, c.saleId, { expected_total_amount: 8000 });
  ids.change = c.saleId;
  // An OPEN sale.
  ids.open = (await walkin.start(KO_AUNG, [services.SHAVE])).saleId;
}, 90_000);
afterAll(() => s.close());

const ofSale = async (saleId: string) => {
  const source = await views.ofSale(prisma, saleId);
  if (source === null) throw new Error('no receipt');
  return source;
};

describe('ReceiptView of a sale (task 9.9)', () => {
  it('Scenario: Split-payment receipt', async () => {
    const { view } = await ofSale(ids.split);
    expect(view).toMatchObject({
      kind: 'sale',
      number: 'B3-2026-OCT-00002',
      original_number: null,
      issued_at: '2026-10-05T10:42:00+06:30',
      barbers: ['Ko Min'],
      customer_name: null,
      customer_phone_masked: null,
      subtotal_amount: 11000,
      discount_amount: 0,
      service_charge_amount: null,
      tax_amount: null,
      total_amount: 11000,
      change_returned: null,
      footer: { opening_hours: 'Mon–Sun 9:00 AM – 9:00 PM', thank_you: null },
      pdf_attachment_id: null,
      png_attachment_id: null,
      rendered_at: null,
    });
    expect(
      view.lines.map((line) => [
        line.description_en,
        line.quantity,
        line.unit_price_amount,
        line.amount,
      ]),
    ).toStrictEqual([
      ['Haircut', 1, 8000, 8000],
      ['Shave', 1, 3000, 3000],
    ]);
    expect(view.payments).toStrictEqual([
      { method: 'Cash', amount: 5000, reference: null },
      { method: 'KBZPay', amount: 6000, reference: 'KBZ0001234567' },
    ]);
    expect(view.branch).toMatchObject({ name: 'Point 3.0', logo_url: null });
  });

  it('Scenario: Customer on the receipt — "Ma Su" and 09•••••456, never the full phone', async () => {
    const { view } = await ofSale(ids.aung);
    expect([view.number, view.customer_name, view.customer_phone_masked]).toStrictEqual([
      'B3-2026-OCT-00001',
      'Ma Su',
      '09•••••456',
    ]);
    expect(JSON.stringify(view)).not.toContain('7712');
  });

  it('the change returned: its amount and refund receipt number', async () => {
    const { view } = await ofSale(ids.change);
    expect([view.number, view.total_amount, view.change_returned]).toStrictEqual([
      'B3-2026-OCT-00003',
      8000,
      { amount: 2000, refund_receipt_number: 'B3-RF-2026-OCT-00001' },
    ]);
  });

  it('Scenario: Receipt of an open sale — 409 invalid_transition', async () => {
    const error = await views.ofSale(prisma, ids.open).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemException);
    expect([
      (error as ProblemException).code,
      (error as ProblemException).status,
      (error as ProblemException).options.context,
    ]).toStrictEqual([ErrorCode.INVALID_TRANSITION, 409, { status: SaleStatus.OPEN }]);
  });

  it('no sale → null', async () => {
    expect(await views.ofSale(prisma, randomUUID())).toBeNull();
  });
});

describe('ReceiptView of a refund (task 9.10)', () => {
  it('Scenario: Receipt of the automatic change return', async () => {
    const refund = await prisma.refunds.findFirstOrThrow({ where: { sale_id: ids.change } });
    const source = await views.ofRefund(prisma, refund.id);
    expect(source?.view).toMatchObject({
      kind: 'refund',
      number: 'B3-RF-2026-OCT-00001',
      original_number: 'B3-2026-OCT-00003',
      barbers: [],
      lines: [],
      total_amount: 2000,
      payments: [{ method: 'Cash', amount: 2000, reference: null }],
      change_returned: null,
    });
    expect(source?.issued_by_user_id).toBe(FIXTURE_IDS.users.E005);
  });

  it('no refund → null', async () => {
    expect(await views.ofRefund(prisma, randomUUID())).toBeNull();
  });
});

describe('The stored files and the branch as it is now (design D10)', () => {
  it('the document is the template at the branch width; the view then names the stored files', async () => {
    const files = s.app.get(ReceiptFiles);
    const entity = { entity_type: 'sales' as const, entity_id: ids.split };
    const set = await files.ensure(entity, 'background', () => views.document(entity));
    expect(renderer.calls.map(({ kind, width }) => [kind, width])).toStrictEqual([
      ['pdf', 58],
      ['png', 384],
    ]);
    expect(renderer.calls[0]?.html).toContain('B3-2026-OCT-00002');
    expect(set.pdf.file_name).toBe('B3-2026-OCT-00002.pdf');
    expect(set.pdf.uploaded_by_user_id).toBe(FIXTURE_IDS.users.E005);
    const { view } = await ofSale(ids.split);
    expect([view.pdf_attachment_id, view.png_attachment_id, view.rendered_at]).toStrictEqual([
      set.pdf.id,
      set.png.id,
      '2026-10-05T10:42:00+06:30',
    ]);
  });

  it('Scenario: On-screen receipt after the branch address changes — the new address; the stored file stays', async () => {
    const files = s.app.get(ReceiptFiles);
    const entity = { entity_type: 'sales' as const, entity_id: ids.aung };
    const first = await files.ensure(entity, 'background', () => views.document(entity));
    const bytes = await storage.head(first.pdf.storage_key);
    await prisma.branches.update({
      where: { id: branches.B3 },
      data: { address_en: 'No. 7, New Road' },
    });
    const { view } = await ofSale(ids.aung);
    expect(view.branch.address).toBe('No. 7, New Road');
    const calls = renderer.calls.length;
    const again = await files.ensure(entity, 'interactive', () => views.document(entity));
    expect([again, renderer.calls.length, await storage.head(again.pdf.storage_key)]).toStrictEqual(
      [first, calls, bytes],
    );
  });
});
