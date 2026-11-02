import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { AttachmentKind } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import sharp from 'sharp';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  DocumentRenderer,
  InMemoryDocumentRenderer,
  InMemoryStorageService,
  StorageService,
} from '../src/modules/platform/index.js';
import type { FixturePerson, SeededApp } from './helpers/seeded.js';
import { seededApp } from './helpers/seeded.js';
import { type WalkinHttp, walkinHttp } from './helpers/walkin-http.js';

// add-company-profile tasks 3.3 / 3.5 — sales-checkout spec "The receipt is English with fixed content"
// (modified): the receipt prints the company as it is when the receipt is rendered — the edited name on
// new receipts, the stored file of an earlier receipt byte for byte (D-PAY-06), the Myanmar name when
// there is no English one (D-DB-04) — and the company logo above the name: `branch.logo_url` = the
// company's `logo_url` (reading 2), the logo inlined into the HTML of both the PDF and the PNG, and a
// missing logo object prints the receipt without it (design D7). Before add-attachments-upload no upload
// can set a logo, so the logo rows are written here by the SQL test builder and their `w800.webp` object
// is put into the in-memory storage. The renderer is the in-memory one: it records the HTML it was given
// (the images are proven by the golden tests of document-renderer.int.test.ts). B3, 05/Oct/2026.
const { services } = FIXTURE_IDS;
const at = (time: string) => new Date(`2026-10-05T${time}:00+06:30`);
const AUNG: FixturePerson = 'E004';
const KYAW_ZIN: FixturePerson = 'E001';
const NAME_MM = 'ပွိုင့် ဘာဘာရှော့';
const LOGO_A = readFileSync(new URL('./fixtures/logo-a.png', import.meta.url));

const storage = new InMemoryStorageService();
const renderer = new InMemoryDocumentRenderer();
let s: SeededApp;
let api: WalkinHttp;
let cash: string;
let companyId: string;
let webp: Buffer;
let first: string;
let firstPdfSha: string;

beforeAll(async () => {
  s = await seededApp(at('10:42'), {
    overrides: [
      { provide: StorageService, useValue: storage },
      { provide: DocumentRenderer, useValue: renderer },
    ],
  });
  api = walkinHttp(s);
  cash = (await s.prisma.payment_methods.findFirstOrThrow({ where: { code: 'CASH' } })).id;
  companyId = (await s.prisma.companies.findFirstOrThrow({ select: { id: true } })).id;
  webp = await sharp(LOGO_A).webp({ lossless: true }).toBuffer();
  // B3-2026-OCT-00001 — Ko Aung, Haircut 10,000, finished 10:42 AM; its PDF stored at once.
  first = await sale();
  firstPdfSha = sha(await pdf(first));
}, 90_000);
afterAll(() => s.close());

/** Ko Aung's Haircut 10,000 paid in cash and finished at the clock's time. */
async function sale(): Promise<string> {
  const visit = await api.start(AUNG, [services.HAIRCUT]);
  await api.complete(AUNG, visit.id);
  await api.pay(AUNG, visit.sale.id, { payment_method_id: cash, amount: 10_000 });
  await api.finish(AUNG, visit.sale.id, { expected_total_amount: 10_000 });
  return visit.sale.id;
}

const receipt = (saleId: string, format: 'json' | 'pdf' | 'png') =>
  api.get(AUNG, `/sales/${saleId}/receipt?format=${format}`);
async function pdf(saleId: string): Promise<Buffer> {
  const res: Response = await s.http
    .get(`/api/v1/sales/${saleId}/receipt?format=pdf`)
    .set('Cookie', await api.cookie(AUNG))
    .buffer(true)
    .parse((stream, done) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => done(null, Buffer.concat(chunks)));
    });
  expect(res.status).toBe(200);
  return res.body as Buffer;
}
const sha = (body: Buffer) => createHash('sha256').update(body).digest('hex');

/** The HTML the renderer received for the PDF and the PNG of one receipt number. */
function htmlOf(number: string): { pdf: string; png: string } {
  const calls = renderer.calls.filter((call) => call.html.includes(number));
  const pdfCall = calls.find((call) => call.kind === 'pdf');
  const pngCall = calls.find((call) => call.kind === 'png');
  if (pdfCall === undefined || pngCall === undefined) throw new Error(`${number} not rendered`);
  return { pdf: pdfCall.html, png: pngCall.html };
}
/** The first text of the receipt — the company name in the header, after the logo if any. */
const startsWith = (html: string) =>
  /<header class="center">(?:<img [^>]*>)?<div class="strong">([^<]*)<\/div>/.exec(html)?.[1];

async function rename(body: object, time: string): Promise<void> {
  s.clock?.set(at(time));
  const res = await s.http
    .patch('/api/v1/company')
    .set('Cookie', await api.cookie(KYAW_ZIN))
    .send(body);
  expect(res.status).toBe(200);
}

/** The SQL test builder of a company logo: its attachment row, `logo_url`, and the variant object. */
async function companyLogo({ object }: { readonly object: boolean }): Promise<string> {
  const id = randomUUID();
  await s.prisma.attachments.create({
    data: {
      id,
      company_id: companyId,
      entity_type: 'companies',
      entity_id: companyId,
      kind: AttachmentKind.IMAGE,
      storage_key: `att/2026/10/${id}/original.png`,
      file_name: 'logo-a.png',
      mime_type: 'image/png',
      size_bytes: BigInt(LOGO_A.length),
      uploaded_by_user_id: FIXTURE_IDS.users.E001,
      uploaded_at: at('09:40'),
    },
  });
  if (object) await storage.put(`att/2026/10/${id}/w800.webp`, webp, 'image/webp');
  await s.prisma.companies.update({
    where: { id: companyId },
    data: { logo_url: `/api/v1/public/media/${id}/original` },
  });
  return id;
}

describe('add-company-profile · sales-checkout · The receipt is English with fixed content (modified)', () => {
  it('Scenario: No logo — the name as text: branch.logo_url null, no image above "Point Barbershop"', async () => {
    const res = await receipt(first, 'json');
    expect(res.status).toBe(200);
    expect(res.body.branch.logo_url).toBeNull();
    const html = htmlOf('B3-2026-OCT-00001');
    expect(startsWith(html.pdf)).toBe('Point Barbershop');
    expect(html.pdf).not.toContain('<img');
  });

  it('Scenario: An edited name is printed on new receipts only', async () => {
    await rename({ name_en: 'Point Barbershop Yangon' }, '11:00');
    s.clock?.set(at('11:05'));
    const next = await sale();
    expect((await receipt(next, 'json')).body.number).toBe('B3-2026-OCT-00002');
    await pdf(next);
    expect(startsWith(htmlOf('B3-2026-OCT-00002').pdf)).toBe('Point Barbershop Yangon');
    // The receipt of 10:42 AM is the stored file, byte for byte — not drawn again (D-PAY-06).
    const rendered = renderer.calls.length;
    expect(sha(await pdf(first))).toBe(firstPdfSha);
    expect(renderer.calls.length).toBe(rendered);
  });

  it('Scenario: Without an English name the Myanmar name is printed', async () => {
    await rename({ name_en: null }, '11:10');
    s.clock?.set(at('11:15'));
    const next = await sale();
    await pdf(next);
    expect(startsWith(htmlOf('B3-2026-OCT-00003').pdf)).toBe(NAME_MM);
  });

  it('Scenario: The company logo above the name — branch.logo_url, the logo inlined into the PDF and the PNG', async () => {
    await rename({ name_en: 'Point Barbershop' }, '11:20');
    const logo = await companyLogo({ object: true });
    s.clock?.set(at('11:25'));
    const next = await sale();
    const json = await receipt(next, 'json');
    expect(json.body.branch.logo_url).toBe(`/api/v1/public/media/${logo}/original`);
    await pdf(next);
    const image = `<img class="logo" src="data:image/webp;base64,${webp.toString('base64')}" alt=""/>`;
    const html = htmlOf('B3-2026-OCT-00004');
    for (const document of [html.pdf, html.png]) {
      expect(document).toContain(`<header class="center">${image}<div class="strong">`);
      expect(startsWith(document)).toBe('Point Barbershop');
    }
  });

  it('a missing logo object — the receipt is rendered without the logo, and a warning names the image', async () => {
    const logo = await companyLogo({ object: false });
    s.clock?.set(at('11:30'));
    const next = await sale();
    expect((await receipt(next, 'json')).body.branch.logo_url).toBe(
      `/api/v1/public/media/${logo}/original`,
    );
    expect((await receipt(next, 'png')).status).toBe(200);
    const html = htmlOf('B3-2026-OCT-00005');
    expect(html.png).not.toContain('<img');
    expect(startsWith(html.png)).toBe('Point Barbershop');
    expect(s.logs).toContainEqual(
      expect.objectContaining({ level: 40, msg: 'receipt.logo_missing', attachment_id: logo }),
    );
  });
});
