import { z } from 'zod';

// Every list endpoint extends this schema (API-LIM-03 · API-DATA-08 · OpenAPI Part 1 `Limit`).
// Cursor encoding and the { items, next_cursor, total } envelope come with the first real list.
export const LIST_LIMIT_DEFAULT = 25;
export const LIST_LIMIT_MAX = 100;

export const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(LIST_LIMIT_MAX).default(LIST_LIMIT_DEFAULT),
  cursor: z.string().min(1).optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;
