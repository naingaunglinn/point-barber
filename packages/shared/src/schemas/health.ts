import { z } from 'zod';

// P1.SYS.01 — liveness only: exactly `status` and `time` (ADR-007 · API-DATA-03).
export const healthSchema = z.strictObject({
  status: z.enum(['ok', 'degraded']),
  time: z.iso.datetime({ offset: true }),
});

export type Health = z.infer<typeof healthSchema>;
