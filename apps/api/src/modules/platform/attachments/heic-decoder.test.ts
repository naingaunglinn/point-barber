import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodeHeic } from './heic-decoder.js';

// add-attachments-upload task 2.1 / design R1 · R2 — the HEIC decode runs in a worker thread that ends
// after the file: the API's event loop stays free, and the decoder's memory goes back.
const HEIC = readFileSync(
  new URL('../../../../test/fixtures/images/gradient-3024x4032.heic', import.meta.url),
);
const PIXELS = 3024 * 4032;

describe('decodeHeic', () => {
  it('answers the upright pixels while the event loop goes on', async () => {
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 10);
    const decoded = await decodeHeic(HEIC, PIXELS).finally(() => clearInterval(timer));
    expect(decoded).toMatchObject({ width: 3024, height: 4032 });
    expect(decoded.data.byteLength).toBe(PIXELS * 4);
    // A decode on this thread lets no timer run between its start and its end.
    expect(ticks).toBeGreaterThan(5);
  }, 60_000);

  it('a size one pixel over the limit is refused, the limit itself is not', async () => {
    await expect(decodeHeic(HEIC, PIXELS - 1)).rejects.toThrow('over the pixel limit');
    await expect(decodeHeic(HEIC, PIXELS)).resolves.toMatchObject({ width: 3024 });
  }, 60_000);

  it('a damaged file is refused, and the next file in the queue still decodes', async () => {
    const damaged = Buffer.from(HEIC);
    damaged.fill(0xff, damaged.indexOf('mdat') + 4); // the container reads, the picture does not
    const [bad, good] = await Promise.allSettled([
      decodeHeic(damaged, PIXELS),
      decodeHeic(HEIC, PIXELS),
    ]);
    expect(bad.status).toBe('rejected');
    expect(good.status).toBe('fulfilled');
  }, 60_000);

  it('repeated decodes of a large file do not grow the process (the worker gives its memory back)', async () => {
    // A `free` box makes the file 20 MB without changing the picture: what leaks is the copy of the FILE
    // a decoder keeps. Measured over 12 decodes: 247 MB on the API's own thread, 51 MB with the worker.
    const padding = Buffer.alloc(20 * 1024 * 1024);
    padding.writeUInt32BE(padding.length, 0);
    padding.write('free', 4, 'latin1');
    const large = Buffer.concat([HEIC, padding]);
    await decodeHeic(large, PIXELS);
    const before = process.memoryUsage().rss;
    for (let round = 0; round < 12; round += 1) await decodeHeic(large, PIXELS);
    expect(process.memoryUsage().rss - before).toBeLessThan(150 * 1024 * 1024);
  }, 120_000);
});
