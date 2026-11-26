// Limits and system codes of the payment-methods master that the API and the app both read
// (add-payment-methods-admin task 1.3 · P4-RULE-19 · DB Part 4 `payment_methods` · CG-ARCH-09).

/** The code of a method: 2 to 30 characters of A-Z, 0-9 and underscore (P4-RULE-19 · P4.PMT.02). */
export const PAYMENT_METHOD_CODE_PATTERN = /^[A-Z0-9_]{2,30}$/;

/** `name_mm` / `name_en` are varchar(100) (DB Part 4 `payment_methods`). */
export const PAYMENT_METHOD_NAME_MAX = 100;

/** `reference_regex` is varchar(200) (DB Part 4); the length test belongs to the format check (design D5). */
export const PAYMENT_METHOD_REGEX_MAX = 200;

/** `sort_order` is an integer column: the largest value a client may send (design D7). */
export const SORT_ORDER_MAX = 2_147_483_647;

/**
 * The most ids a reorder may send. No source caps the number of methods (D-PAY-01 "more methods can be
 * added"), so it is the ceiling of the locked read, `READ_ROW_CEILING` of apps/api/src/common/limits.ts
 * (a test of the API pins the two equal).
 */
export const PAYMENT_METHOD_ORDER_MAX = 1_000;

/** The two system methods of the base seed (P4-RULE-19 · D6): shown locked, never archived. */
export const SYSTEM_PAYMENT_METHOD_CODES: readonly string[] = ['CASH', 'KBZPAY'];
