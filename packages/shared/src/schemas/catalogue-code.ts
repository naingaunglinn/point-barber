// A field schema names its catalogue error code with catalogueCode('phone_invalid'): the API then
// returns that code instead of the Zod issue name, without params (API-ERR-03 · design D8).
export const CATALOGUE_CODE_PREFIX = 'code:';

export function catalogueCode(code: string): { error: string } {
  return { error: `${CATALOGUE_CODE_PREFIX}${code}` };
}
