// Minimal types of the part of `multer` the upload reader uses (the package ships none and `@types/multer`
// is not added for one call site — CG-DEP-03).
declare module 'multer' {
  import type { Readable } from 'node:stream';

  import type { Request, Response } from 'express';

  namespace multer {
    interface File {
      fieldname: string;
      originalname: string;
      stream: Readable;
      buffer?: Buffer;
      size?: number;
    }

    interface StorageEngine {
      _handleFile(
        req: Request,
        file: File,
        callback: (error?: unknown, info?: Partial<File>) => void,
      ): void;
      _removeFile(req: Request, file: File, callback: (error: Error | null) => void): void;
    }

    interface Options {
      storage: StorageEngine;
      preservePath?: boolean;
      defParamCharset?: string;
      limits?: Record<string, number>;
      fileFilter?: (
        req: Request,
        file: File,
        callback: (error: Error | null, accept?: boolean) => void,
      ) => void;
    }

    class MulterError extends Error {
      readonly code: string;
      readonly field?: string;
    }
  }

  function multer(options: multer.Options): {
    any(): (req: Request, res: Response, next: (error?: unknown) => void) => void;
  };

  export = multer;
}
