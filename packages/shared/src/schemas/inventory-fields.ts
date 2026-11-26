import { z } from 'zod';

// The field building blocks of the Part 6 master schemas (add-product-catalogue design D8 · API-ERR-03):
// the trimmed bilingual names, the optional texts whose blank is null (D-DB-04), the `sort_order` integer
// and the body of an order request. A failed bound is the Zod issue name (`too_small` / `too_big` /
// `invalid_type`, API-ERR-03); request schemas are plain z.object, so an unknown member is stripped
// (CG-API-03).

/** `sort_order` integer column: 0 … 2,147,483,647 (DB Part 6). */
export const SORT_ORDER_MAX = 2_147_483_647;

/** Blank after trimming is null, as the branch and company schemas store an empty optional text. */
const blankAsNull = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

/** A required, trimmed name of 1 – `max` characters (the Myanmar name — D-DB-04). */
export const requiredName = (max: number) => z.string().trim().min(1).max(max);

/**
 * An optional text of at most `max` characters after trimming, or null; an empty or blank one is stored
 * as NULL (the English UI then falls back to the Myanmar name — AD-L10N-03). Absent stays `undefined`,
 * which an update reads as "not sent".
 */
export const optionalText = (max: number) =>
  z.preprocess(blankAsNull, z.string().trim().max(max).nullable()).optional();

/** An explicit position: an integer 0 … 2,147,483,647; absent = placed last (PC1 — the service). */
export const sortOrderField = z.int().min(0).max(SORT_ORDER_MAX).optional();

/**
 * The body of `PUT …/order` (P6.CAT.06 · P6.RSN.05): the ids of the rows in their new order. The service
 * checks that the list is exactly the non-archived set, every id once (400 `validation` on `ids`).
 */
export const idsOrderSchema = z.object({ ids: z.array(z.uuid()).min(1) });
export type IdsOrder = z.infer<typeof idsOrderSchema>;
