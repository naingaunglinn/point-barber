// Fixture: a bare ts-ignore and undescribed disables fail (CG-TS-01 · CG-META-05).
// @ts-ignore
const total: number = '7,000';

// eslint-disable-next-line no-console
console.log(total);

// eslint-disable-next-line -- tidy
export const shown = total;
