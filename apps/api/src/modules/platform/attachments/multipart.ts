import { BYTES_PER_MB, ErrorCode } from '@point/shared';
import type { Request, Response } from 'express';
import multer from 'multer';

import { ProblemException } from '../../../common/http/problem.exception.js';
import { MULTIPART_LIMITS } from '../../../common/limits.js';

// The multipart reader of `POST /v1/attachments` (design D3 · API-SHAPE-05 · API-LIM-03 · CG-SEC-08):
// Multer on memory storage, with a hard stop at `system.upload_max_mb` × 1,048,576 bytes — a file of
// exactly that many bytes is read completely, a larger one is stopped one byte past it, so the body is
// never buffered whole. The first `file` part is read; any other part (a second file, an unknown text
// part) is drained and dropped. The file name is kept as received: UTF-8, no path stripping, and it is
// never used in a key, a header or a log line.

export interface UploadedPart {
  readonly name: string;
  readonly bytes: Buffer;
}

export interface UploadedForm {
  readonly file: UploadedPart | undefined;
  /** As sent: a text, a list when the part came twice, or nothing — the schema decides. */
  readonly purpose: unknown;
}

/** Memory storage that counts what it held, so a test can prove the stop (a held buffer is the risk). */
export class BufferedFile implements multer.StorageEngine {
  /** Bytes read into memory for the file part, the stopped part included. */
  buffered = 0;

  _handleFile(
    _req: Request,
    file: multer.File,
    callback: (error?: unknown, info?: Partial<multer.File>) => void,
  ): void {
    const chunks: Buffer[] = [];
    file.stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      this.buffered += chunk.length;
    });
    file.stream.on('error', callback);
    file.stream.on('end', () => {
      const buffer = Buffer.concat(chunks);
      callback(null, { buffer, size: buffer.length });
    });
  }

  _removeFile(_req: Request, file: multer.File, callback: (error: Error | null) => void): void {
    delete file.buffer;
    callback(null);
  }
}

/** The one file part and the `purpose` of the request; throws a `ProblemException` for a refusal. */
export async function readUpload(
  req: Request,
  res: Response,
  maxMb: number,
  storage: BufferedFile = new BufferedFile(),
): Promise<UploadedForm> {
  let taken = false;
  const parse = multer({
    storage,
    preservePath: true,
    defParamCharset: 'utf8',
    limits: { ...MULTIPART_LIMITS, fileSize: maxMb * BYTES_PER_MB },
    fileFilter: (_req, part, accept) => {
      const take = part.fieldname === 'file' && !taken;
      taken ||= take;
      accept(null, take);
    },
  }).any();
  try {
    await new Promise<void>((resolve, reject) => {
      parse(req, res, (error?: unknown) => (error === undefined ? resolve() : reject(error)));
    });
  } catch (error) {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      throw new ProblemException(ErrorCode.FILE_TOO_LARGE, 422, { context: { max_mb: maxMb } });
    }
    // A body that is not a readable form: too many parts, a long text part, a cut-off or aborted request.
    throw new ProblemException(ErrorCode.VALIDATION, 400, { errors: [] });
  }
  const { files, body } = req as unknown as {
    files?: { originalname: string; buffer?: Buffer }[];
    body?: { purpose?: unknown };
  };
  const part = files?.[0];
  return {
    file: part?.buffer === undefined ? undefined : { name: part.originalname, bytes: part.buffer },
    purpose: body?.purpose,
  };
}
