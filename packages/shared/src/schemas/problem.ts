import { z } from 'zod';

// RFC 9457 problem details (API-ERR-01 · API-ERR-02 · OpenAPI Part 1 `Problem`). `code` is the
// language key under `error.*`; `request_id` equals the X-Request-Id header.
export const fieldErrorSchema = z.strictObject({
  field: z.string(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

// Top-level extension members of the codes that carry one (API-ERR-02 · Part 0 §401 / §429):
// `until` — login_locked (P1-RULE-03) · `reason` — session_revoked, the revoke_reason code
// (P1-RULE-04) · `retry_after` — rate_limited, whole seconds, also sent as Retry-After (API-LIM-02).
export const problemExtensionsSchema = z.strictObject({
  until: z.iso.datetime({ offset: true }).optional(),
  reason: z.number().int().optional(),
  retry_after: z.number().int().positive().optional(),
});

export const problemSchema = z.strictObject({
  type: z.url().optional(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  ...problemExtensionsSchema.shape,
  request_id: z.uuid(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type ProblemExtensions = z.infer<typeof problemExtensionsSchema>;
export type Problem = z.infer<typeof problemSchema>;
