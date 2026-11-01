import { randomUUID } from 'node:crypto';

import { AttachmentKind } from '@point/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  type PdfPage,
  StorageService,
} from '../src/modules/platform/index.js';
import { type ReceiptDocument, ReceiptFiles } from '../src/modules/sales/index.js';
import { createPerson, testCompany } from './helpers/people.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 9.11 — ReceiptFiles.ensure (ADR-013 · ADR-014 · CG-DB-10 · P4-RULE-18 ·
// design D10): read → render and put outside any transaction → a short transaction under
// `receipt:<entity_id>` that looks again, then stores the two rows or deletes this path's objects. The
// job and a GET that race store one PDF row, one PNG row and two objects. Storage and renderer are the
// in-memory fakes (CG-ARCH-08); the receipt template comes with tasks 9.2 / 9.3.

/** Holds every PDF render until `release()` — both paths have read "no files" and rendered. */
class GatedRenderer extends InMemoryDocumentRenderer {
  private gate: Promise<void> = Promise.resolve();
  private open: () => void = () => undefined;

  hold(): void {
    this.gate = new Promise((resolve) => {
      this.open = resolve;
    });
  }
  release(): void {
    this.open();
  }
  override async renderPdf(html: string, page: PdfPage): Promise<Buffer> {
    const pdf = await super.renderPdf(html, page);
    await this.gate;
    return pdf;
  }
}

const storage = new InMemoryStorageService();
const renderer = new GatedRenderer();
let t: TestApp;
let prisma: PrismaService;
let files: ReceiptFiles;
let companyId: string;
let userId: string;

beforeAll(async () => {
  t = await startTestApp({
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
    ],
  });
  prisma = t.app.get(PrismaService);
  files = t.app.get(ReceiptFiles);
  companyId = await testCompany(prisma);
  userId = (await createPerson(prisma, companyId)).userId;
});
afterAll(() => t.close());
beforeEach(() => {
  renderer.calls.length = 0;
});

const sale = () => ({ entity_type: 'sales' as const, entity_id: randomUUID() });
const document =
  (width_mm: 58 | 80 = 58) =>
  (): Promise<ReceiptDocument> =>
    Promise.resolve({
      html: '<p>B3-2026-OCT-00001</p>',
      width_mm,
      number: 'B3-2026-OCT-00001',
      company_id: companyId,
      uploaded_by_user_id: userId,
    });

describe('ReceiptFiles.ensure (design D10)', () => {
  it('renders and stores the PDF and the PNG at the branch width; the rows name them', async () => {
    const entity = sale();
    const set = await files.ensure(entity, 'background', document());
    expect(renderer.calls.map(({ kind, width }) => [kind, width])).toStrictEqual([
      ['pdf', 58],
      ['png', 384],
    ]);
    expect(
      [set.pdf, set.png].map((row) => [row.mime_type, row.file_name, row.kind, row.entity_type]),
    ).toStrictEqual([
      ['application/pdf', 'B3-2026-OCT-00001.pdf', AttachmentKind.DOCUMENT, 'sales'],
      ['image/png', 'B3-2026-OCT-00001.png', AttachmentKind.DOCUMENT, 'sales'],
    ]);
    expect(set.pdf.uploaded_by_user_id).toBe(userId);
    // The key carries the row's id (ADR-014); the object holds what the renderer returned.
    expect(set.pdf.storage_key).toMatch(
      new RegExp(`^att/\\d{4}/\\d{2}/${set.pdf.id}/original\\.pdf$`),
    );
    const head = await storage.head(set.png.storage_key);
    expect(head).toStrictEqual({ size_bytes: set.png.size_bytes, content_type: 'image/png' });
  });

  it('an 80 mm branch: the PNG is 576 px wide', async () => {
    await files.ensure(sale(), 'background', document(80));
    expect(renderer.calls.map(({ width }) => width)).toStrictEqual([80, 576]);
  });

  it('a stored set is returned as it is — nothing rendered, the document not built', async () => {
    const entity = sale();
    const first = await files.ensure(entity, 'background', document());
    renderer.calls.length = 0;
    let built = false;
    const again = await files.ensure(entity, 'interactive', () => {
      built = true;
      return document()();
    });
    expect([again, renderer.calls, built]).toStrictEqual([first, [], false]);
  });

  it('Race: the job and a GET at once store one PDF row, one PNG row and two objects', async () => {
    const entity = sale();
    const before = storage.keys();
    renderer.hold();
    const job = files.ensure(entity, 'background', document());
    const get = files.ensure(entity, 'interactive', document());
    // Both have read "no files" and are rendering.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(renderer.calls.filter(({ kind }) => kind === 'pdf')).toHaveLength(2);
    renderer.release();
    const [a, b] = await Promise.all([job, get]);
    expect(a).toStrictEqual(b);
    const rows = await prisma.attachments.findMany({
      where: { entity_type: 'sales', entity_id: entity.entity_id },
    });
    expect(rows.map((row) => row.mime_type).sort()).toStrictEqual(['application/pdf', 'image/png']);
    const added = storage.keys().filter((key) => !before.includes(key));
    expect(added.sort()).toStrictEqual([a.pdf.storage_key, a.png.storage_key].sort());
  });

  it('a failure while storing the rows deletes this path’s objects and rethrows', async () => {
    const entity = sale();
    const before = storage.keys();
    const failing = async (): Promise<ReceiptDocument> => ({
      ...(await document()()),
      uploaded_by_user_id: randomUUID(), // no such user: the row's foreign key refuses it
    });
    await expect(files.ensure(entity, 'background', failing)).rejects.toThrow();
    expect(storage.keys()).toStrictEqual(before);
    expect(
      await prisma.attachments.count({
        where: { entity_type: 'sales', entity_id: entity.entity_id },
      }),
    ).toBe(0);
  });
});
