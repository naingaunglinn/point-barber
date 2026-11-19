import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { SIGNED_URL_SECONDS } from '@point/shared';

import type { AppConfig } from '../src/common/config/config.js';
import { processImage } from '../src/modules/platform/attachments/image-pipeline.js';
import { objectKey } from '../src/modules/platform/attachments/variant-object.js';
import { S3StorageService } from '../src/modules/platform/storage/s3-storage.service.js';
import { gradientImage } from './helpers/test-images.js';

// add-attachments-upload task 2.7 — a signed link against a real S3 API (MinIO): the object loads with
// the link and is refused without it (ADR-014 decision 4 and action item 5 · design D9). No database.
const config = {
  env: {
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_BUCKET_APP: process.env.S3_BUCKET_APP,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
  },
} as unknown as AppConfig;
const storage = new S3StorageService(config);
const id = randomUUID();
const row = { storage_key: `att/2026/10/${id}/original.jpg`, mime_type: 'image/jpeg' };

beforeAll(async () => {
  await storage.ensureBucket();
  const { original, variants } = await processImage(await gradientImage('jpeg', 900, 600), {
    format: 'JPEG',
  });
  await storage.put(row.storage_key, original.body, 'image/jpeg');
  await storage.put(objectKey(row, 'w400'), variants[0]!.body, 'image/webp');
});

describe('presigned links on MinIO', () => {
  it('the original loads with a signed link (200) and is refused without a signature (403)', async () => {
    const link = await storage.presignGet(row.storage_key, { expiresInSeconds: SIGNED_URL_SECONDS });
    const signed = await fetch(link);
    expect(signed.status).toBe(200);
    expect(signed.headers.get('content-type')).toBe('image/jpeg');
    const bare = await fetch(link.split('?')[0]!);
    expect(bare.status).toBe(403);
  });

  it('w400.webp loads with its own link as image/webp', async () => {
    const response = await fetch(
      await storage.presignGet(objectKey(row, 'w400'), { expiresInSeconds: SIGNED_URL_SECONDS }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
  });

  it('a download link makes the bucket answer with the attachment disposition', async () => {
    const response = await fetch(
      await storage.presignGet(row.storage_key, {
        expiresInSeconds: SIGNED_URL_SECONDS,
        downloadName: 'nrc front.pdf',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''nrc%20front.pdf",
    );
  });

  it('a link with a changed key is refused (the signature covers the path)', async () => {
    const link = await storage.presignGet(row.storage_key, { expiresInSeconds: SIGNED_URL_SECONDS });
    expect((await fetch(link.replace('original.jpg', 'w400.webp'))).status).toBe(403);
  });
});
