import { randomUUID } from 'node:crypto';

import { AttachmentKind } from '@point/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import { type Tx, TransactionRunner } from '../src/common/database/transaction-runner.js';
import { Attachments, ReceiptFilesLock } from '../src/modules/platform/index.js';
import { createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 3.6 — the generated rows of a receipt (ADR-014 · P4-RULE-18 · design
// D10): Attachments.storeGenerated writes one row per stored object, findGenerated reads the live
// rows of an entity, and ReceiptFilesLock (`receipt:<entity_id>`, exclusive, held to commit) lets the
// job and a GET store exactly one set.
let t: TestApp;
let prisma: PrismaService;
let runner: TransactionRunner;
let attachments: Attachments;
let lock: ReceiptFilesLock;
let companyId: string;
let userId: string;

beforeAll(async () => {
  t = await startTestApp();
  prisma = t.app.get(PrismaService);
  runner = t.app.get(TransactionRunner);
  attachments = t.app.get(Attachments);
  lock = t.app.get(ReceiptFilesLock);
  companyId = await testCompany(prisma);
  userId = (await createPerson(prisma, companyId)).userId;
});
afterAll(() => t.close());

const file = (saleId: string, ext: 'pdf' | 'png') => ({
  ...attachments.newGeneratedKey(ext),
  company_id: companyId,
  entity_type: 'sales' as const,
  entity_id: saleId,
  kind: AttachmentKind.DOCUMENT,
  file_name: `B3-2026-OCT-00001.${ext}`,
  mime_type: ext === 'pdf' ? 'application/pdf' : 'image/png',
  size_bytes: ext === 'pdf' ? 18_204 : 9_310,
  uploaded_by_user_id: userId,
});

describe('Attachments.storeGenerated / findGenerated', () => {
  it('stores the PDF and the PNG of a sale and finds both, PDF first', async () => {
    const saleId = randomUUID();
    const pdf = file(saleId, 'pdf');
    const png = file(saleId, 'png');
    await runner.run(async (tx) => {
      await attachments.storeGenerated(tx, png);
      await attachments.storeGenerated(tx, pdf);
    });
    const found = await attachments.findGenerated('sales', saleId);
    expect(
      found.map((row) => [row.mime_type, row.storage_key, row.size_bytes, row.kind]),
    ).toStrictEqual([
      ['application/pdf', pdf.storage_key, 18_204, AttachmentKind.DOCUMENT],
      ['image/png', png.storage_key, 9_310, AttachmentKind.DOCUMENT],
    ]);
    expect(
      found.every((row) => typeof row.id === 'string' && row.uploaded_at instanceof Date),
    ).toBe(true);
  });

  it('finds nothing for another entity, and skips a deleted row', async () => {
    const saleId = randomUUID();
    const pdf = file(saleId, 'pdf');
    await runner.run((tx) => attachments.storeGenerated(tx, pdf));
    expect(await attachments.findGenerated('refunds', saleId)).toStrictEqual([]);
    await prisma.attachments.updateMany({
      where: { storage_key: pdf.storage_key },
      data: { deleted_at: new Date() },
    });
    expect(await attachments.findGenerated('sales', saleId)).toStrictEqual([]);
  });

  it('inside a transaction, finds the rows that transaction stored', async () => {
    const saleId = randomUUID();
    const seen = await runner.run(async (tx) => {
      await attachments.storeGenerated(tx, file(saleId, 'pdf'));
      return attachments.findGenerated('sales', saleId);
    });
    expect(seen).toHaveLength(1);
  });
});

async function advisoryLocks(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRaw<{ mode: string }[]>`
    SELECT mode FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()`;
  return rows.map((row) => row.mode);
}

describe('ReceiptFilesLock (receipt:<entity_id>)', () => {
  it('is exclusive and held to commit: a second holder waits for the first', async () => {
    const saleId = randomUUID();
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let acquired!: () => void;
    const first = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const one = runner.run(async (tx) => {
      await lock.acquire(tx, saleId);
      expect(await advisoryLocks(tx)).toStrictEqual(['ExclusiveLock']);
      order.push('one locked');
      acquired();
      await held;
      order.push('one commits');
    });
    await first;
    const two = runner.run(async (tx) => {
      await lock.acquire(tx, saleId);
      order.push('two locked');
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await Promise.all([one, two]);
    expect(order).toStrictEqual(['one locked', 'one commits', 'two locked']);
  });
});
