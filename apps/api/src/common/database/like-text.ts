// Text for a Prisma `contains` / `startsWith` / `equals` + `mode: 'insensitive'` filter. On PostgreSQL
// these compile to ILIKE without escaping, so `%` and `_` in user input would act as wildcards; the
// backslash is ILIKE's escape character (CG-SEC-01 — input is data, never pattern syntax).
export function likeText(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}
