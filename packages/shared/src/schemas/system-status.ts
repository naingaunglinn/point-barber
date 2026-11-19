import { z } from 'zod';

// P1.SYS.02 — maintenance flag, release and server time (D-PLT-08 · OpenAPI Part 1 `SystemStatus`).
export const systemStatusSchema = z.strictObject({
  maintenance: z.boolean(),
  until: z.iso.datetime({ offset: true }).nullable(),
  message_mm: z.string().nullable(),
  message_en: z.string().nullable(),
  version: z.string(),
  server_time: z.iso.datetime({ offset: true }),
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;
