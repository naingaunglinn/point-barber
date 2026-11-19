import type { Readable } from 'node:stream';

// File storage (ADR-014 · CG-ARCH-08 · add-walkin-visit-checkout design D10): one S3-compatible
// bucket behind this interface. No call is made inside a database transaction (CG-DB-10). Keys are
// `att/<yyyy>/<mm>/<attachment_id>/original.<ext>` (ADR-014); the bucket is private.

export interface StoredObjectInfo {
  readonly size_bytes: number;
  readonly content_type: string | null;
}

export abstract class StorageService {
  /** Writes (or replaces) the object at `key`. */
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The object's bytes as a stream; throws StorageObjectMissing when there is none. */
  abstract getStream(key: string): Promise<Readable>;
  /** Size and type of the object; null when there is none. */
  abstract head(key: string): Promise<StoredObjectInfo | null>;
  /** Removes the object; removing a missing object is not an error. */
  abstract delete(key: string): Promise<void>;
}

export class StorageObjectMissing extends Error {
  constructor(readonly key: string) {
    super(`No stored object at ${key}`);
    this.name = 'StorageObjectMissing';
  }
}
