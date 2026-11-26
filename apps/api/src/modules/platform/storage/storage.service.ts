import type { Readable } from 'node:stream';

// File storage (ADR-014 · CG-ARCH-08 · add-walkin-visit-checkout design D10): one S3-compatible
// bucket behind this interface. No call is made inside a database transaction (CG-DB-10). Keys are
// `att/<yyyy>/<mm>/<attachment_id>/original.<ext>` (ADR-014); the bucket is private.

export interface StoredObjectInfo {
  readonly size_bytes: number;
  readonly content_type: string | null;
}

export interface PresignGetOptions {
  /** How long the link works, in seconds (ADR-014 decision 4: 300). */
  readonly expiresInSeconds: number;
  /** When given, the link makes the browser save the file under this name instead of showing it. */
  readonly downloadName?: string;
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
  /**
   * A time-limited GET link for the object (ADR-014 decision 4 · add-attachments-upload D9). It is signed
   * locally — no bucket call — so it also works for a key that does not exist yet; the bucket host in it
   * is the one a browser can reach. The link is a secret: never log it (CG-SEC-10).
   */
  abstract presignGet(key: string, options: PresignGetOptions): Promise<string>;
}

export class StorageObjectMissing extends Error {
  constructor(readonly key: string) {
    super(`No stored object at ${key}`);
    this.name = 'StorageObjectMissing';
  }
}
