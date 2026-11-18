import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { IMAGE_MAX_INPUT_PIXELS } from '@point/shared';

import { gradientImage, solidPng } from '../../../../test/helpers/test-images.js';
import { ImageNotDecodable, processImage } from './image-pipeline.js';

// add-attachments-upload tasks 2.3 and 2.5 — the values of the spec scenarios (P8-RULE-03 · ADR-014
// decision 3 · design D5). Every image is made by code at test time (D15).
const JPEG = { format: 'JPEG' } as const;
const PNG = { format: 'PNG' } as const;
const sizeOf = async (body: Buffer) => {
  const { width, height, format, orientation } = await sharp(body).metadata();
  return { width, height, format, orientation };
};
const names = (result: Awaited<ReturnType<typeof processImage>>) => [
  'original',
  ...result.variants.map((variant) => variant.name),
];

describe('processImage — size', () => {
  it('photo-aung.jpg 4000 x 3000 becomes 2560 x 1920 with variants 400 / 800 / 1600', async () => {
    const input = await gradientImage('jpeg', 4000, 3000, { gps: true, orientation: 1 });
    const result = await processImage(input, JPEG);
    expect(result.original).toMatchObject({ width: 2560, height: 1920 });
    expect(await sizeOf(result.original.body)).toMatchObject({ width: 2560, height: 1920, format: 'jpeg' });
    expect(names(result)).toEqual(['original', 'w400', 'w800', 'w1600']);
    expect(result.variants.map(({ width, height }) => [width, height])).toEqual([
      [400, 300],
      [800, 600],
      [1600, 1200],
    ]);
  });

  it('photo-tall.jpg 3200 x 2400 with orientation 6 is turned upright: 1920 x 2560, no tag', async () => {
    const input = await gradientImage('jpeg', 3200, 2400, { orientation: 6 });
    const result = await processImage(input, JPEG);
    expect(result.original).toMatchObject({ width: 1920, height: 2560 });
    expect((await sizeOf(result.original.body)).orientation).toBeUndefined();
  });

  it('2560 x 1440 is re-encoded and unchanged; 2561 x 1440 becomes 2560 x 1439', async () => {
    const same = await processImage(await gradientImage('jpeg', 2560, 1440), JPEG);
    const wider = await processImage(await gradientImage('jpeg', 2561, 1440), JPEG);
    expect(same.original).toMatchObject({ width: 2560, height: 1440 });
    expect(wider.original).toMatchObject({ width: 2560, height: 1439 });
  });
});

describe('processImage — variants', () => {
  it('logo-a.png 600 x 600 stays a PNG with variants ["original", "w400"]', async () => {
    const result = await processImage(await gradientImage('png', 600, 600), PNG);
    expect(names(result)).toEqual(['original', 'w400']);
    expect(await sizeOf(result.original.body)).toMatchObject({ width: 600, height: 600, format: 'png' });
    expect(await sizeOf(result.variants[0]!.body)).toMatchObject({ width: 400, height: 400, format: 'webp' });
  });

  it('logo-b.jpg 800 x 400 makes w800 (equal width): 400 x 200 and 800 x 400', async () => {
    const result = await processImage(await gradientImage('jpeg', 800, 400, { gps: true }), JPEG);
    expect(names(result)).toEqual(['original', 'w400', 'w800']);
    expect(result.variants.map(({ width, height }) => [width, height])).toEqual([
      [400, 200],
      [800, 400],
    ]);
  });

  it('receipt-bill.jpg 1200 x 1600 has no w1600 (the width decides, not the long edge)', async () => {
    const result = await processImage(await gradientImage('jpeg', 1200, 1600), JPEG);
    expect(names(result)).toEqual(['original', 'w400', 'w800']);
  });

  it('a WebP upload stays a WebP', async () => {
    const result = await processImage(await gradientImage('webp', 900, 300), { format: 'WebP' });
    expect(await sizeOf(result.original.body)).toMatchObject({ width: 900, height: 300, format: 'webp' });
  });
});

describe('processImage — metadata and refusals', () => {
  it('the original and every variant carry no EXIF or GPS', async () => {
    const input = await gradientImage('jpeg', 4000, 3000, { gps: true, orientation: 6 });
    // The fixture really has the data the pipeline has to drop.
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const result = await processImage(input, JPEG);
    for (const body of [result.original.body, ...result.variants.map((variant) => variant.body)]) {
      const meta = await sharp(body).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
    }
  });

  it('a JPEG signature on damaged bytes is refused', async () => {
    const damaged = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    await expect(processImage(damaged, JPEG)).rejects.toBeInstanceOf(ImageNotDecodable);
  });

  it('IMAGE_MAX_INPUT_PIXELS is 50,000,000: that many pixels pass, one more is refused', async () => {
    expect(IMAGE_MAX_INPUT_PIXELS).toBe(50_000_000);
    const atLimit = await processImage(await solidPng(10_000, 5_000), PNG);
    expect(atLimit.original).toMatchObject({ width: 2560, height: 1280 });
    await expect(processImage(await solidPng(10_000, 5_001), PNG)).rejects.toBeInstanceOf(
      ImageNotDecodable,
    );
  });

  // Task 2.1: the pinned sharp has no HEVC decoder (design R1), so HEIC is not built here.
  it.todo('thura-bill.heic 3024 x 4032 becomes a JPEG of 1920 x 2560 (waits for the HEIC decision)');
});
