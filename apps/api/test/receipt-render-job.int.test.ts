import { setTimeout as sleep } from 'node:timers/promises';

import { SaleStatus } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  type PdfPage,
  type RenderPriority,
  StorageService,
} from '../src/modules/platform/index.js';
import { ReceiptFiles, ReceiptViews } from '../src/modules/sales/index.js';
import { checkout } from './helpers/checkout.js';
import { type SeededApp, seededApp } from './helpers/seeded.js';
import { KO_AUNG, KO_MIN } from './helpers/walkin.js';

// add-walkin-visit-checkout task 9.12 — the `receipt.render` worker (ADR-002 · ADR-013 decision 8 · design
// D10 · sales-checkout spec "rendered once, stored, and identical on every reopen"): FINISH sends the job,
// the worker stores the PDF and the PNG (and the refund receipt of a change return); a stored set is left
// alone; three failed attempts leave the sale FINISHED, log one error, and the receipt still renders on
// the fly afterwards. The workers run in this app (JOBS_IN_API); storage and renderer are the fakes.
const { services } = FIXTURE_IDS;

/** The in-memory renderer: `down` fails every render, `jobDown` only the background ones (the job's). */
class SwitchRenderer extends InMemoryDocumentRenderer {
  down = false;
  jobDown = false;
  backgroundRenders = 0;
  override renderPdf(html: string, page: PdfPage, priority?: RenderPriority): Promise<Buffer> {
    const background = priority !== 'interactive';
    if (this.down || (this.jobDown && background)) {
      return Promise.reject(new Error('renderer down (test)'));
    }
    if (background) this.backgroundRenders += 1;
    return super.renderPdf(html, page);
  }
}

const storage = new InMemoryStorageService();
const renderer = new SwitchRenderer();
let s: SeededApp;
let prisma: PrismaService;
let walkin: ReturnType<typeof checkout>;
let cash: string;
let kbzpay: string;

beforeAll(async () => {
  s = await seededApp(new Date('2026-10-05T10:42:00+06:30'), {
    jobs: true,
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
    ],
  });
  prisma = s.app.get(PrismaService);
  walkin = checkout(s.app);
  cash = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  kbzpay = (await prisma.payment_methods.findFirstOrThrow({ where: { code: 'KBZPAY' } })).id;
}, 90_000);
afterAll(() => s.close());

async function finished(who: typeof KO_AUNG, pay: Record<string, unknown>, total: number) {
  const ids = await walkin.start(who, [services.HAIRCUT]);
  await walkin.pay(who, ids.saleId, pay);
  await walkin.complete(who, ids.visitId);
  await walkin.finish(who, ids.saleId, { expected_total_amount: total });
  return ids.saleId;
}

interface JobState {
  readonly state: string;
  readonly retry_count: number;
}

/** The `receipt.render` job of an entity once it reaches one of `states`. */
async function job(entityId: string, states: readonly string[]): Promise<JobState> {
  const deadline = Date.now() + 45_000;
  for (;;) {
    const [row] = await prisma.$queryRaw<JobState[]>`
      SELECT state::text AS state, retry_count FROM pgboss.job
      WHERE name = 'receipt.render' AND data->>'entity_id' = ${entityId}`;
    if (row !== undefined && states.includes(row.state)) return row;
    if (Date.now() > deadline) throw new Error(`job of ${entityId}: ${row?.state ?? 'none'}`);
    await sleep(250);
  }
}

const stored = (entityType: string, entityId: string) =>
  prisma.attachments.findMany({
    where: { entity_type: entityType, entity_id: entityId },
    select: { mime_type: true },
    orderBy: { mime_type: 'asc' },
  });

describe('receipt.render (task 9.12)', () => {
  it('FINISH → the worker stores one PDF and one PNG; a change return gets its own receipt', async () => {
    const saleId = await finished(
      KO_MIN,
      { payment_method_id: kbzpay, amount: 10000, external_reference: 'KBZ0001234590' },
      8000,
    );
    expect((await job(saleId, ['completed', 'failed'])).state).toBe('completed');
    expect((await stored('sales', saleId)).map((row) => row.mime_type)).toStrictEqual([
      'application/pdf',
      'image/png',
    ]);
    const refund = await prisma.refunds.findFirstOrThrow({ where: { sale_id: saleId } });
    expect((await job(refund.id, ['completed', 'failed'])).state).toBe('completed');
    expect(await stored('refunds', refund.id)).toHaveLength(2);
  }, 60_000);

  it('Scenario: Opened before the job ran — the job then stores nothing', async () => {
    // The job cannot render, so whatever its timing the request's render is the one stored.
    renderer.jobDown = true;
    const background = renderer.backgroundRenders;
    const saleId = await finished(KO_AUNG, { payment_method_id: cash, amount: 10000 }, 10000);
    const views = s.app.get(ReceiptViews);
    const entity = { entity_type: 'sales' as const, entity_id: saleId };
    const set = await s.app
      .get(ReceiptFiles)
      .ensure(entity, 'interactive', () => views.document(entity));
    renderer.jobDown = false;
    // The job (first attempt, or its retry) finds the stored set and renders nothing.
    expect((await job(saleId, ['completed', 'failed'])).state).toBe('completed');
    expect(renderer.backgroundRenders).toBe(background);
    const rows = await prisma.attachments.findMany({
      where: { entity_type: 'sales', entity_id: saleId },
      select: { id: true },
    });
    expect(rows.map((row) => row.id).sort()).toStrictEqual([set.pdf.id, set.png.id].sort());
  }, 60_000);

  it('Scenario: Renderer down — 3 attempts, the sale stays FINISHED, one error; later rendered on the fly', async () => {
    renderer.down = true;
    const before = s.logs.length;
    const saleId = await finished(KO_AUNG, { payment_method_id: cash, amount: 10000 }, 10000);
    const failed = await job(saleId, ['failed', 'completed']);
    renderer.down = false;
    expect([failed.state, failed.retry_count]).toStrictEqual(['failed', 2]);
    const sale = await prisma.sales.findUniqueOrThrow({ where: { id: saleId } });
    expect([sale.status, sale.receipt_number]).toStrictEqual([
      SaleStatus.FINISHED,
      expect.stringMatching(/^B3-2026-OCT-\d{5}$/),
    ]);
    const logs = s.logs.slice(before).filter((line) => line.entity_id === saleId);
    expect(logs.map((line) => [line.level, line.msg])).toStrictEqual([
      [40, 'receipt render failed — pg-boss retries it'],
      [40, 'receipt render failed — pg-boss retries it'],
      [50, 'receipt render failed on its last attempt'],
    ]);
    expect(await stored('sales', saleId)).toHaveLength(0);
    // A later `format=pdf` request renders and stores the receipt through the same path.
    const views = s.app.get(ReceiptViews);
    const entity = { entity_type: 'sales' as const, entity_id: saleId };
    await s.app.get(ReceiptFiles).ensure(entity, 'interactive', () => views.document(entity));
    expect(await stored('sales', saleId)).toHaveLength(2);
  }, 90_000);
});
