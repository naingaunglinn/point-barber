import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

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
