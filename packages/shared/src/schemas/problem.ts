import { z } from 'zod';

// RFC 9457 problem details (API-ERR-01 · API-ERR-02 · OpenAPI Part 1 `Problem`). `code` is the
// language key under `error.*`; `request_id` equals the X-Request-Id header.
export const fieldErrorSchema = z.strictObject({
  field: z.string(),
  code: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const problemSchema = z.strictObject({
  type: z.url().optional(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  errors: z.array(fieldErrorSchema).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
  request_id: z.uuid(),
});

export type FieldError = z.infer<typeof fieldErrorSchema>;
export type Problem = z.infer<typeof problemSchema>;
