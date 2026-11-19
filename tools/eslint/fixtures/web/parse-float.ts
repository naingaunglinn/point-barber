// Must fail twice: parseFloat and Number.parseFloat (CG-MONEY-01).
export const toKyats = (input: string) => parseFloat(input);
export const toKyatsToo = (input: string) => Number.parseFloat(input);
