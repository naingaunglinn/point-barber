import { Readable } from 'node:stream';

import {
  StorageObjectMissing,
  type StorageService,
  type StoredObjectInfo,
} from './storage.service.js';

// The in-memory StorageService of the unit tests (CG-ARCH-08): the same contract as the S3 one,
// with no network. `keys()` lets a test see what was stored.
export class InMemoryStorageService implements StorageService {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  getStream(key: string): Promise<Readable> {
    const object = this.objects.get(key);
    if (object === undefined) return Promise.reject(new StorageObjectMissing(key));
    return Promise.resolve(Readable.from([object.body]));
  }

  head(key: string): Promise<StoredObjectInfo | null> {
    const object = this.objects.get(key);
    return Promise.resolve(
      object === undefined
        ? null
        : { size_bytes: object.body.length, content_type: object.contentType },
    );
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  keys(): string[] {
    return [...this.objects.keys()].sort();
  }
}
