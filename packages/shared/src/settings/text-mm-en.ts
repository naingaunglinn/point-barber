import { z } from 'zod';

// The two text shapes the settings values and the website bodies share (CG-API-03: one source) — a leaf
// module, so `schemas/website.ts` and `settings/values.ts` need not import each other.

/** A trimmed text of at most `max` characters; absent, null or empty after trimming → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === undefined || value === null || value === '' ? null : value));

/**
 * A `text_mm_en` value: `mm` `minLength` (default 1) – `maxLength` after trimming, `en` ≤ `maxLength`,
 * empty → null. The site texts allow an empty Myanmar text (add-website-management reading 2).
 */
export function textMmEnSchema(maxLength: number, minLength = 1) {
  return z.object({
    mm: z.string().trim().min(minLength).max(maxLength),
    en: optionalText(maxLength),
  });
}
