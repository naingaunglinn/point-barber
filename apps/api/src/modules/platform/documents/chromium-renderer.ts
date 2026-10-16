import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { type Browser, type Page, chromium } from 'playwright-core';
import type { Logger } from 'pino';
import sharp from 'sharp';

import { LOGGER } from '../../../common/logging/logger.js';
import { DocumentRenderer, type PdfPage } from './document-renderer.js';
import { PRINTER_WIDTH_PX } from './paper.js';
import { type RenderPriority, RenderQueue } from './render-queue.js';

// The DocumentRenderer on headless Chromium (ADR-013 decisions 1, 7 · add-walkin-visit-checkout design
// D10): one browser per API process, launched on first use and kept warm; one page at a time through
// the queue; JavaScript off and every network request aborted, so a template draws only what its HTML
// holds (fonts are embedded in it); the fonts are awaited before printing. A crashed browser is
// relaunched on the next render, and the browser is recycled after RECYCLE_AFTER renders.

/** Build constants (ADR-013 — "a timeout, a build constant"). */
export const RENDER_TIMEOUT_MS = 10_000;
export const RECYCLE_AFTER = 200;

const CSS_PX_PER_MM = 96 / 25.4;

@Injectable()
export class ChromiumDocumentRenderer extends DocumentRenderer implements OnApplicationShutdown {
  private readonly queue = new RenderQueue();
  private browser: Promise<Browser> | undefined;
  private renders = 0;

  constructor(@Inject(LOGGER) private readonly log: Logger) {
    super();
  }

  override renderPdf(
    html: string,
    page: PdfPage,
    priority: RenderPriority = 'background',
  ): Promise<Buffer> {
    // Laid out at the printer's dots like the PNG, then scaled to the paper width (Chromium lays a
    // page out at its width divided by the scale).
    const layoutPx = PRINTER_WIDTH_PX[page.widthMm];
    const scale = (page.widthMm * CSS_PX_PER_MM) / layoutPx;
    return this.render(priority, layoutPx, async (tab) => {
      await this.load(tab, html);
      // A string expression: the API is compiled without the DOM library.
      const heightPx = Number(await tab.evaluate('document.documentElement.scrollHeight'));
      return tab.pdf({
        width: `${page.widthMm}mm`,
        height: `${Math.ceil(heightPx * scale)}px`,
        scale,
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        pageRanges: '1',
      });
    });
  }

  override renderPng(
    html: string,
    widthPx: number,
    priority: RenderPriority = 'background',
  ): Promise<Buffer> {
    return this.render(priority, widthPx, async (tab) => {
      await this.load(tab, html);
      const shot = await tab.screenshot({ fullPage: true, type: 'png' });
      // Thermal printers print black or nothing: a 2-colour palette (ADR-013 decision 3).
      return sharp(shot)
        .flatten({ background: '#ffffff' })
        .greyscale()
        .threshold(128)
        .png({ palette: true, colours: 2 })
        .toBuffer();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private render(
    priority: RenderPriority,
    widthPx: number,
    draw: (tab: Page) => Promise<Buffer>,
  ): Promise<Buffer> {
    let tab: Page | undefined;
    return this.queue.run(
      async () => {
        const browser = await this.launch();
        const context = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: widthPx, height: 100 },
          deviceScaleFactor: 1,
          offline: true,
        });
        try {
          tab = await context.newPage();
          await tab.route('**/*', (route) => route.abort());
          return await draw(tab);
        } finally {
          await context.close().catch(() => undefined);
          this.renders += 1;
          if (this.renders >= RECYCLE_AFTER) await this.close();
        }
      },
      {
        priority,
        timeoutMs: RENDER_TIMEOUT_MS,
        // A render that hangs takes the browser with it; the next render launches a fresh one.
        onTimeout: async () => {
          this.log.error({ priority }, 'document render timed out — browser restarted');
          await this.close();
        },
      },
    );
  }

  private async load(tab: Page, html: string): Promise<void> {
    await tab.setContent(html, { waitUntil: 'load' });
    // No document is drawn with a fallback font (ADR-013 decision 2).
    await tab.evaluate('document.fonts.ready.then(() => true)');
  }

  private launch(): Promise<Browser> {
    // A container's /dev/shm is 64 MB by default: Chromium keeps its shared memory in /tmp instead.
    this.browser ??= chromium
      .launch({ headless: true, args: ['--disable-dev-shm-usage'] })
      .then((browser) => {
        browser.on('disconnected', () => {
          this.browser = undefined;
        });
        return browser;
      });
    return this.browser;
  }

  private async close(): Promise<void> {
    const browser = this.browser;
    this.browser = undefined;
    this.renders = 0;
    if (browser !== undefined) await (await browser).close().catch(() => undefined);
  }
}
