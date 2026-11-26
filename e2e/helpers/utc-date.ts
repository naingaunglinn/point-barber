/**
 * `YYYY-MM-DD` of a date that was built at UTC midnight, read with the UTC getters. It is for the
 * e2e workspace, which does not depend on @point/shared; a real instant goes through
 * `businessDateOf` there (CG-TIME-02), never through a cut of `toISOString()`.
 */
export function utcDateOf(day: Date): string {
  const month = String(day.getUTCMonth() + 1).padStart(2, '0');
  const date = String(day.getUTCDate()).padStart(2, '0');
  return `${day.getUTCFullYear()}-${month}-${date}`;
}
