import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../../../common/config/config.js';
import { InMemoryStorageService } from './in-memory-storage.service.js';
import { S3StorageService, type S3Sender } from './s3-storage.service.js';
import { StorageObjectMissing, type StorageService } from './storage.service.js';

// add-walkin-visit-checkout task 3.4 — one contract for both StorageServices (ADR-014 · CG-ARCH-08):
// the in-memory fake of the unit tests and the S3 implementation, here on a stub client that answers
// like S3 (NotFound on a missing head, NoSuchKey on a missing get). The round trip against a real
// S3 API (MinIO) is test/storage.int.test.ts.

const config = {
  env: {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_REGION: 'us-east-1',
    S3_BUCKET_APP: 'point-test',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  },
} as unknown as AppConfig;

/** A stub of S3Client.send over a map; it records every command it was sent. */
class StubS3 implements S3Sender {
  readonly sent: object[] = [];
  private readonly objects = new Map<string, { body: Buffer; type: string }>();

  send(command: object): Promise<unknown> {
    this.sent.push(command);
    const missing = (name: string) =>
      Promise.reject(Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } }));
    if (command instanceof PutObjectCommand) {
      const { Key, Body, ContentType } = command.input;
      this.objects.set(String(Key), { body: Body as Buffer, type: String(ContentType) });
      return Promise.resolve({});
    }
    const key = String((command as { input: { Key?: string } }).input.Key);
    const object = this.objects.get(key);
    if (command instanceof GetObjectCommand) {
      return object === undefined
        ? missing('NoSuchKey')
        : Promise.resolve({ Body: Readable.from([object.body]) });
    }
    if (command instanceof HeadObjectCommand) {
      return object === undefined
        ? missing('NotFound')
        : Promise.resolve({ ContentLength: object.body.length, ContentType: object.type });
    }
    if (command instanceof DeleteObjectCommand) {
      this.objects.delete(key);
      return Promise.resolve({});
    }
    return Promise.reject(new Error('unexpected command'));
  }
}

const implementations: [string, () => StorageService][] = [
  ['InMemoryStorageService', () => new InMemoryStorageService()],
  ['S3StorageService', () => new S3StorageService(config, new StubS3())],
];

const KEY = 'att/2026/10/0199a3f2-7c1e-7b3a-9d4e-2f6a8c1b5e70/original.pdf';

describe.each(implementations)('%s', (_, make) => {
  it('stores, describes, streams and deletes an object', async () => {
    const storage = make();
    await storage.put(KEY, Buffer.from('%PDF-1.7 receipt'), 'application/pdf');
    expect(await storage.head(KEY)).toStrictEqual({
      size_bytes: 16,
      content_type: 'application/pdf',
    });
    expect(await text(await storage.getStream(KEY))).toBe('%PDF-1.7 receipt');
    await storage.delete(KEY);
    expect(await storage.head(KEY)).toBeNull();
  });

  it('a missing object: head is null, getStream throws StorageObjectMissing', async () => {
    const storage = make();
    expect(await storage.head(KEY)).toBeNull();
    await expect(storage.getStream(KEY)).rejects.toBeInstanceOf(StorageObjectMissing);
  });

  it('deleting a missing object is not an error; put replaces', async () => {
    const storage = make();
    await storage.delete(KEY);
    await storage.put(KEY, Buffer.from('one'), 'image/png');
    await storage.put(KEY, Buffer.from('second'), 'image/png');
    expect((await storage.head(KEY))?.size_bytes).toBe(6);
  });
});

describe('S3StorageService', () => {
  it('addresses the configured bucket with the key and content type', async () => {
    const client = new StubS3();
    await new S3StorageService(config, client).put(KEY, Buffer.from('x'), 'application/pdf');
    expect((client.sent[0] as PutObjectCommand).input).toMatchObject({
      Bucket: 'point-test',
      Key: KEY,
      ContentType: 'application/pdf',
    });
  });

  it('passes on an error that is not a missing object', async () => {
    const failing: S3Sender = {
      send: () =>
        Promise.reject(Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' })),
    };
    const storage = new S3StorageService(config, failing);
    await expect(storage.head(KEY)).rejects.toThrow('AccessDenied');
    await expect(storage.getStream(KEY)).rejects.toThrow('AccessDenied');
    await expect(storage.ensureBucket()).rejects.toThrow('AccessDenied');
  });

  it('ensureBucket (development and test, task 3.5): creates a missing bucket, leaves an existing one', async () => {
    const answers = (bucket: 'missing' | 'there'): S3Sender & { sent: object[] } => {
      const sent: object[] = [];
      return {
        sent,
        send(command: object) {
          sent.push(command);
          if (command instanceof HeadBucketCommand && bucket === 'missing') {
            return Promise.reject(
              Object.assign(new Error('NotFound'), {
                name: 'NotFound',
                $metadata: { httpStatusCode: 404 },
              }),
            );
          }
          return Promise.resolve({});
        },
      };
    };
    const missing = answers('missing');
    expect(await new S3StorageService(config, missing).ensureBucket()).toBe('created');
    expect(missing.sent.map((command) => command.constructor)).toStrictEqual([
      HeadBucketCommand,
      CreateBucketCommand,
    ]);
    expect((missing.sent[1] as CreateBucketCommand).input).toStrictEqual({ Bucket: 'point-test' });
    const there = answers('there');
    expect(await new S3StorageService(config, there).ensureBucket()).toBe('exists');
    expect(there.sent).toHaveLength(1);
  });
});
