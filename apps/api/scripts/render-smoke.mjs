// One render inside the api image (add-walkin-visit-checkout task 9.16 · ADR-013): the built
// DocumentRenderer launches the image's headless shell as the user the container runs as and renders a
// Myanmar receipt line to a PDF and a 384 px 2-colour PNG. CI job `images` runs it with the file mounted
// into /app; from apps/api it runs against a local build:
//   docker run --rm -v "$PWD/apps/api/scripts/render-smoke.mjs:/app/render-smoke.mjs:ro" \
//     --entrypoint node point-api:<version> render-smoke.mjs
import 'reflect-metadata';

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PRINTER_WIDTH_PX, receiptBaseCss } from '@point/documents';
import sharp from 'sharp';

const { ChromiumDocumentRenderer } = await import(
  pathToFileURL(resolve('dist/modules/platform/documents/chromium-renderer.js')).href
);

const renderer = new ChromiumDocumentRenderer({ error: (...args) => console.error(...args) });
const html =
  `<!doctype html><html><head><meta charset="utf-8"><style>${receiptBaseCss(58)}</style></head>` +
  '<body><p>B3-2026-OCT-00001</p><p>အင်္ဂလိပ် ဆံပင်ညှပ် (မန္တလေး)</p></body></html>';
try {
  const pdf = await renderer.renderPdf(html, { widthMm: 58 });
  const png = await renderer.renderPng(html, PRINTER_WIDTH_PX[58]);
  const { width, isPalette } = await sharp(png).metadata();
  if (pdf.subarray(0, 5).toString() !== '%PDF-' || width !== 384 || isPalette !== true) {
    console.error(`render-smoke: unexpected output — PNG width ${width}, palette ${isPalette}`);
    process.exitCode = 1;
  } else {
    console.log(`render-smoke: ok — PDF ${pdf.length} bytes, PNG ${width} px, ${png.length} bytes`);
  }
} finally {
  await renderer.onApplicationShutdown();
}
