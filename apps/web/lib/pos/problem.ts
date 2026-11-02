import type { Problem } from '@point/shared';

import { ApiProblem } from '../api/client';

// The refusal a POS screen shows (API-ERR-01): the API's problem as the components take it — code,
// context, field errors and the request id (its first 8 characters are the error ID, AD-STATE-03). An
// error without an answer (no network) reads as `unknown`; the offline banner says the rest.
export interface ScreenProblem {
  readonly code: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly errors?: readonly { readonly field: string; readonly code: string }[];
  readonly request_id: string;
}

export function screenProblem(error: unknown): ScreenProblem {
  if (!(error instanceof ApiProblem)) return { code: 'unknown', request_id: '' };
  const { code, request_id } = error.problem;
  const extra = error.problem as Problem & {
    readonly context?: Readonly<Record<string, unknown>>;
    readonly errors?: readonly { readonly field: string; readonly code: string }[];
  };
  return {
    code,
    request_id,
    ...(extra.context === undefined ? {} : { context: extra.context }),
    ...(extra.errors === undefined ? {} : { errors: extra.errors }),
  };
}
