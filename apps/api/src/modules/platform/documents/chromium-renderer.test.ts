import { type Browser, chromium } from 'playwright-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChromiumDocumentRenderer } from './chromium-renderer.js';

// add-walkin-visit-checkout task 9.5 (review of #26) — ADR-013 decision 1: one browser per API process,
// launched on first use. A launch that fails is not kept: the render that asked fails, the next render
// launches again (the crash case runs on a real browser in document-renderer.int.test.ts).
const tab = {
  route: async () => undefined,
  setContent: async () => undefined,
  evaluate: async () => 100,
  pdf: async () => Buffer.from('%PDF'),
};
const browser = {
  on: () => browser,
  newContext: async () => ({ newPage: async () => tab, close: async () => undefined }),
  close: vi.fn(async () => undefined),
} as unknown as Browser;

const renderer = () => new ChromiumDocumentRenderer({ error: () => undefined } as never);
const html = '<!doctype html><p>x</p>';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChromiumDocumentRenderer — a failed launch', () => {
  it('fails that render; the next render launches a fresh browser', async () => {
    const launch = vi
      .spyOn(chromium, 'launch')
      .mockRejectedValueOnce(new Error('Chromium did not start'))
      .mockResolvedValueOnce(browser);
    const docs = renderer();

    await expect(docs.renderPdf(html, { widthMm: 80 })).rejects.toThrow('Chromium did not start');
    await expect(docs.renderPdf(html, { widthMm: 80 })).resolves.toStrictEqual(Buffer.from('%PDF'));
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('a shutdown during a launch that then fails ends without an error', async () => {
    let fail: (error: Error) => void = () => undefined;
    vi.spyOn(chromium, 'launch').mockReturnValueOnce(
      new Promise<Browser>((_resolve, reject) => {
        fail = reject;
      }),
    );
    const docs = renderer();

    const render = docs.renderPdf(html, { widthMm: 80 });
    await vi.waitFor(() => expect(chromium.launch).toHaveBeenCalledTimes(1));
    const shutdown = docs.onApplicationShutdown();
    fail(new Error('Chromium did not start'));

    await expect(shutdown).resolves.toBeUndefined();
    await expect(render).rejects.toThrow('Chromium did not start');
  });
});
