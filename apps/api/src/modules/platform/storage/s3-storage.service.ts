import { Readable } from 'node:stream';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { AppConfig } from '../../../common/config/config.js';
import {
  StorageObjectMissing,
  type StorageService,
  type StoredObjectInfo,
} from './storage.service.js';

// StorageService on the S3 API with a configurable endpoint (ADR-014 decision 1): the provider is
// configuration. Path-style addressing, which MinIO needs and R2 and B2 accept.

/** The part of S3Client this service uses — a test passes a stub. */
export interface S3Sender {
  send(command: object): Promise<unknown>;
}

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as { name?: unknown }).name === 'NotFound' ||
    (error as { name?: unknown }).name === 'NoSuchKey' ||
    (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode === 404);

/**
 * How long one bucket call may take (CG-ERR-06 · guideline row 89): a bucket that stalls or an endpoint
 * that drops packets fails the call instead of holding a receipt read or `receipt.render` until the OS
 * gives up. The SDK retries a timed-out call (3 attempts in all) — safe for these idempotent calls.
 */
export const S3_TIMEOUTS = { connectionTimeout: 5_000, requestTimeout: 5_000 } as const;

export interface S3Timeouts {
  readonly connectionTimeout: number;
  readonly requestTimeout: number;
}

/** Built by the factory of PlatformModule; a test passes its own S3Sender or shorter timeouts. */
export class S3StorageService implements StorageService {
  private readonly bucket: string;
  private readonly client: S3Sender;

  constructor(config: AppConfig, client?: S3Sender, timeouts: S3Timeouts = S3_TIMEOUTS) {
    const env = config.env;
    this.bucket = env.S3_BUCKET_APP;
    this.client =
      client ??
      new S3Client({
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        forcePathStyle: true,
        // Without throwOnRequestTimeout the SDK only warns when requestTimeout passes.
        requestHandler: { ...timeouts, throwOnRequestTimeout: true },
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        },
      });
  }

  /**
   * The local MinIO starts with no bucket: in development and test the API creates its own when it is
   * missing (task 3.5). Staging and production use the owner's bucket and never call this (ADR-014).
   */
  async ensureBucket(): Promise<'exists' | 'created'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'exists';
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    return 'created';
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getStream(key: string): Promise<Readable> {
    try {
      const output = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as { Body?: unknown };
      if (output.Body instanceof Readable) return output.Body;
      throw new Error(`The body of ${key} is not a Node stream`);
    } catch (error) {
      if (isMissing(error)) throw new StorageObjectMissing(key);
      throw error;
    }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const output = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as { ContentLength?: number; ContentType?: string };
      return { size_bytes: output.ContentLength ?? 0, content_type: output.ContentType ?? null };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
