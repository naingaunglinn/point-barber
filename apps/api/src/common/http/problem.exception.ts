import type { ErrorCode, FieldError, ProblemExtensions } from '@point/shared';

// The only way a module raises an error (CG-ERR-03 · design D7). `code` comes from the catalogue in
// packages/shared and is the language key `error.<code>`.
export interface ProblemOptions {
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly context?: Readonly<Record<string, unknown>>;
  /** Top-level members: `until`, `reason`, `retry_after` (API-ERR-02). */
  readonly extensions?: ProblemExtensions;
  /** Response headers sent with the body — `Retry-After` beside `retry_after` (API-LIM-02). */
  readonly headers?: Readonly<Record<string, string>>;
}

export class ProblemException extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly options: ProblemOptions = {},
  ) {
    super(code);
    this.name = 'ProblemException';
  }
}
