// Fixture: a ts-expect-error needs a description of at least 10 characters (CG-TS-01).
// @ts-expect-error
export const a: number = 'a';

// @ts-expect-error -- 123456
export const b: number = 'b';

// @ts-expect-error -- 1234567
export const c: number = 'c';
