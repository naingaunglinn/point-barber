import { randomUUID } from 'node:crypto';
import { text } from 'node:stream/consumers';

import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppConfig } from '../src/common/config/config.js';
import { StorageObjectMissing, StorageService } from '../src/modules/platform/index.js';
import { type TestApp, startTestApp } from './helpers/test-app.js';

// add-walkin-visit-checkout task 3.5 — one round trip through the application's StorageService
// against a real S3 API: MinIO (always part of docker-compose.dev.yml; a step of the CI job
// `integration`). ADR-014 · design D10. The test creates its bucket when it is missing; in production
// the bucket is the owner's.
let t: TestApp;
let storage: StorageService;

beforeAll(async () => {
  t = await startTestApp();
  storage = t.app.get(StorageService);
  const { env } = t.app.get(AppConfig);
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET_APP }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET_APP }));
  }
  client.destroy();
});
afterAll(() => t.close());

describe('StorageService round trip (S3 API)', () => {
  it('put → head → get → delete → head null', async () => {
    const key = `att/2026/10/${randomUUID()}/original.pdf`;
    await storage.put(key, Buffer.from('%PDF-1.7 B3-2026-OCT-00001'), 'application/pdf');
    expect(await storage.head(key)).toStrictEqual({
      size_bytes: 26,
      content_type: 'application/pdf',
    });
    expect(await text(await storage.getStream(key))).toBe('%PDF-1.7 B3-2026-OCT-00001');
    await storage.delete(key);
    expect(await storage.head(key)).toBeNull();
    await expect(storage.getStream(key)).rejects.toBeInstanceOf(StorageObjectMissing);
  });
});
