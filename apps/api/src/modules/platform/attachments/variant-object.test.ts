import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../common/clock/clock.js';
import type { AppConfig } from '../../../common/config/config.js';
import type { AttachmentsRepository } from '../repositories/attachments.repository.js';
import { Attachments } from './attachments.service.js';
import { variantsOf, type VariantSource } from './variant-object.js';

// add-attachments-upload task 2.8 — "Server code reads a live row and the object of a variant …" (AT3).
const attachments = new Attachments({} as AttachmentsRepository, {} as Clock, {} as AppConfig);
const A = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e01';
const B = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e02';
const N = '0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e03';
const logoA: VariantSource = {
  storage_key: `att/2026/10/${A}/original.png`,
  mime_type: 'image/png',
  image_width: 600,
};
const logoB: VariantSource = {
  storage_key: `att/2026/10/${B}/original.jpg`,
  mime_type: 'image/jpeg',
  image_width: 800,
};
const nrc: VariantSource = {
  storage_key: `att/2026/10/${N}/original.pdf`,
  mime_type: 'application/pdf',
  image_width: null,
};

describe('Attachments.variantObject', () => {
  it('a small logo has no w800, so its original is returned', () => {
    expect(attachments.variantObject(logoA, 'w800')).toEqual({
      key: `att/2026/10/${A}/original.png`,
      mime: 'image/png',
    });
  });

  it('a variant that was made answers with its WebP object', () => {
    expect(attachments.variantObject(logoB, 'w800')).toEqual({
      key: `att/2026/10/${B}/w800.webp`,
      mime: 'image/webp',
    });
    expect(attachments.variantObject(logoA, 'w400')).toEqual({
      key: `att/2026/10/${A}/w400.webp`,
      mime: 'image/webp',
    });
  });

  it('a file that is not an image answers with its original for every variant', () => {
    expect(attachments.variantObject(nrc, 'w400')).toEqual({
      key: `att/2026/10/${N}/original.pdf`,
      mime: 'application/pdf',
    });
    expect(attachments.variantObject(nrc, 'w1600').key).toBe(nrc.storage_key);
  });

  it('original returns the row key and mime', () => {
    expect(attachments.variantObject(logoB, 'original')).toEqual({
      key: logoB.storage_key,
      mime: 'image/jpeg',
    });
  });
});

describe('Attachments.objectKey and variantsOf', () => {
  it('names the object of each variant in the row folder', () => {
    expect(attachments.objectKey(logoB, 'original')).toBe(logoB.storage_key);
    expect(attachments.objectKey(logoB, 'w1600')).toBe(`att/2026/10/${B}/w1600.webp`);
  });

  it('lists the variants that exist: a width equal to the original is made, a wider one is not', () => {
    expect(variantsOf(600)).toEqual(['original', 'w400']);
    expect(variantsOf(800)).toEqual(['original', 'w400', 'w800']);
    expect(variantsOf(2560)).toEqual(['original', 'w400', 'w800', 'w1600']);
    expect(variantsOf(null)).toEqual([]);
  });
});
