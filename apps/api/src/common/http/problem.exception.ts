import type { FieldError } from '@point/shared';

// The only way a module raises an error (CG-ERR-03 · design D7). `code` comes from the catalogue in
// packages/shared and is the language key `error.<code>`.
export interface ProblemOptions {
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
  readonly context?: Readonly<Record<string, unknown>>;
}

export class ProblemException extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly options: ProblemOptions = {},
  ) {
    super(code);
    this.name = 'ProblemException';
  }
}
