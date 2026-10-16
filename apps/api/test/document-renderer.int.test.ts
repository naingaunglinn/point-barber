import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { type PaperWidthMm, PRINTER_WIDTH_PX, receiptHtml } from '@point/documents';
import type { ReceiptViewDto } from '@point/shared';

import type { Browser } from 'playwright-core';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ChromiumDocumentRenderer } from '../src/modules/platform/documents/chromium-renderer.js';

// add-walkin-visit-checkout tasks 9.5, 9.7, 9.8 (renderer part) — ADR-013: headless Chromium with
// JavaScript off and every network request blocked; a PDF of the paper width whose text can be read
// back; a 2-colour PNG at the printer width; a crashed browser is replaced on the next render. The
// receipt templates and their golden image come with packages/documents.
const logs: unknown[] = [];
const renderer = new ChromiumDocumentRenderer({
  error: (...args: unknown[]) => logs.push(args),
} as never);

let server: Server;
let hits = 0;
let origin: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    hits += 1;
    res.end('x');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await renderer.onApplicationShutdown();
  await new Promise((resolve) => server.close(resolve));
});

const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:22px sans-serif}</style></head><body>${body}</body></html>`;

async function pdfText(pdf: Buffer): Promise<{ text: string; widthPt: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const first = await doc.getPage(1);
  const content = await first.getTextContent();
  const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
  return { text, widthPt: first.view[2] ?? 0 };
}

describe('ChromiumDocumentRenderer (ADR-013)', () => {
  it('a PDF of the paper width whose text reads back — 58 mm, the receipt number', async () => {
    const pdf = await renderer.renderPdf(page('<p>B3-2026-OCT-00001</p><p>Total 10,000 Ks</p>'), {
      widthMm: 58,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, widthPt } = await pdfText(pdf);
    expect(text).toContain('B3-2026-OCT-00001');
    // Chromium snaps a custom page size to its own grid (58 mm comes out as 165.12 pt = 58.25 mm), so
    // the width is checked to half a millimetre.
    expect(Math.abs((widthPt * 25.4) / 72 - 58)).toBeLessThan(0.5);
  }, 30_000);

  it('the PDF shows the layout of the 384 px print: a line that fits 384 px stays one line', async () => {
    // At 22 px this line is about 330 px wide: one line at 384 px, two at the 219 px of 58 mm.
    const line = 'Haircut 1 x 10,000 = 10,000';
    const pdf = await renderer.renderPdf(page(`<p style="margin:0">${line}</p>`), { widthMm: 58 });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
    const items = (await (await doc.getPage(1)).getTextContent()).items.filter(
      (item) => 'str' in item && item.str.trim() !== '',
    );
    const rows = new Set(items.map((item) => ('transform' in item ? item.transform[5] : null)));
    expect(rows.size).toBe(1);
  }, 30_000);

  it('a long receipt stays on one page', async () => {
    const lines = Array.from({ length: 80 }, (_, i) => `<p>Line ${i + 1}</p>`).join('');
    const pdf = await renderer.renderPdf(page(lines), { widthMm: 58 });
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
    expect(doc.numPages).toBe(1);
    expect((await pdfText(pdf)).text).toContain('Line 80');
  }, 30_000);

  it('an 80 mm PDF for the wide printer', async () => {
    const pdf = await renderer.renderPdf(page('<p>Receipt</p>'), { widthMm: 80 });
    const { widthPt } = await pdfText(pdf);
    expect(Math.abs((widthPt * 25.4) / 72 - 80)).toBeLessThan(0.5);
  }, 30_000);

  it('a PNG 384 px wide in two colours (58 mm printer)', async () => {
    const png = await renderer.renderPng(page('<p>B3-2026-OCT-00001</p>'), 384);
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(384);
    const { data } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    expect(new Set(data).size).toBeLessThanOrEqual(2);
    expect(meta.isPalette).toBe(true);
  }, 30_000);

  it('a PNG 576 px wide for an 80 mm printer', async () => {
    const png = await renderer.renderPng(page('<p>Receipt</p>'), 576);
    expect((await sharp(png).metadata()).width).toBe(576);
  }, 30_000);

  it('JavaScript is off: a script in a template draws nothing', async () => {
    const pdf = await renderer.renderPdf(
      page(
        '<p id="p">static</p><script>document.getElementById("p").textContent="SCRIPTED"</script>',
      ),
      { widthMm: 58 },
    );
    const { text } = await pdfText(pdf);
    expect(text).toContain('static');
    expect(text).not.toContain('SCRIPTED');
  }, 30_000);

  it('every network request is blocked: an image or font URL is never fetched', async () => {
    hits = 0;
    await renderer.renderPng(
      page(
        `<style>@font-face{font-family:X;src:url(${origin}/font.woff2)}</style><img src="${origin}/logo.png"><p style="font-family:X">text</p>`,
      ),
      384,
    );
    expect(hits).toBe(0);
  }, 30_000);

  it('a crashed browser is replaced on the next render', async () => {
    await renderer.renderPng(page('<p>one</p>'), 384);
    const browser = (renderer as unknown as { browser: Promise<Browser> }).browser;
    await (await browser).close();
    const png = await renderer.renderPng(page('<p>two</p>'), 384);
    expect((await sharp(png).metadata()).width).toBe(384);
  }, 30_000);
});

// Task 9.8 — golden images of the receipt template (AD-RCPT-01 · AD-RCPT-02 · ADR-013 decision 2): the
// split-payment receipt B3-2026-OCT-00002 with an item that has no English name — a kinzi (အင်္ဂလိပ်) and
// a stacked consonant (မန္တလေး) — shaped with the package fonts at both printer widths. A wrong or missing
// font, text drawn without shaping or a layout change moves far more than the tolerance allows (a few
// edge pixels, for a different Linux font configuration). `UPDATE_GOLDEN=1` writes new images — look at
// them before committing.
const GOLDEN = new URL('./golden/', import.meta.url);
const receiptView: ReceiptViewDto = {
  kind: 'sale',
  number: 'B3-2026-OCT-00002',
  original_number: null,
  issued_at: '2026-10-05T10:50:00+06:30',
  branch: { name: 'Point 3.0', address: null, phone: null, logo_url: null },
  barbers: ['Ko Min'],
  customer_name: null,
  customer_phone_masked: null,
  lines: [
    {
      description_en: null,
      description_mm: 'အင်္ဂလိပ် ဆံပင်ညှပ် (မန္တလေး)',
      option: null,
      performer: 'Ko Min',
      quantity: 1,
      unit_price_amount: 8000,
      amount: 8000,
    },
    {
      description_en: 'Shave',
      description_mm: 'မုတ်ဆိတ်ရိတ်',
      option: null,
      performer: 'Ko Min',
      quantity: 1,
      unit_price_amount: 3000,
      amount: 3000,
    },
  ],
  subtotal_amount: 11000,
  discount_label: null,
  discount_amount: 0,
  service_charge_amount: null,
  tax_amount: null,
  total_amount: 11000,
  payments: [
    { method: 'Cash', amount: 5000, reference: null },
    { method: 'KBZPay', amount: 6000, reference: 'KBZ0001234567' },
  ],
  change_returned: null,
  footer: { opening_hours: 'Mon–Sun 9:00 AM – 9:00 PM', thank_you: null },
  pdf_attachment_id: null,
  png_attachment_id: null,
  rendered_at: null,
};
const receipt = (paper: PaperWidthMm) =>
  receiptHtml({ view: receiptView, company: 'Point Barbershop', paper });

async function grey(png: Buffer) {
  return sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
}

describe('Golden images — the receipt with Myanmar shaping (task 9.8)', () => {
  it.each([58, 80] as const)(
    '%i mm',
    async (paper) => {
      const png = await renderer.renderPng(receipt(paper), PRINTER_WIDTH_PX[paper]);
      const file = new URL(`receipt-${paper}mm.png`, GOLDEN);
      if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
        if (process.env.CI !== undefined)
          throw new Error(`golden image ${file.pathname} is missing`);
        mkdirSync(GOLDEN, { recursive: true });
        writeFileSync(file, png);
      }
      const actual = await grey(png);
      const expected = await grey(readFileSync(file));
      expect([actual.info.width, actual.info.height]).toStrictEqual([
        expected.info.width,
        expected.info.height,
      ]);
      let differing = 0;
      for (let i = 0; i < actual.data.length; i += 1) {
        if (actual.data[i] !== expected.data[i]) differing += 1;
      }
      expect(differing / actual.data.length).toBeLessThanOrEqual(0.005);
    },
    30_000,
  );
});
