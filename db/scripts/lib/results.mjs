// Parser for the result query that ends every point-sdd *-test.sql file (design D4.9):
//   SELECT n, label, expect, result ('PASS' | 'FAIL'), got FROM r ORDER BY n;
// The runner calls psql with -qAt -0 -F SEP: records end with NUL (a line break inside a label
// stays inside its record), fields are SEP-separated; the void t() calls print empty records.
// Row numbers come from a serial starting at 1, so a dropped row shows up as a gap.
export const SEP = '\u001f';

export function evaluate(fileName, output) {
  const cases = [];
  for (const record of output.split('\0')) {
    const fields = record.replace(/^\r?\n/, '').split(SEP);
    if (fields.length < 4) continue;
    const [n, label, , result] = fields;
    if (!/^\d+$/.test(n ?? '') || (result !== 'PASS' && result !== 'FAIL')) continue;
    cases.push({ n: Number(n), label, result });
  }
  const messages = [];
  if (cases.length === 0) messages.push(`${fileName}: no result row`);
  const highest = Math.max(0, ...cases.map((c) => c.n));
  if (cases.length > 0 && highest !== cases.length) {
    messages.push(
      `${fileName}: ${cases.length} result row(s) read, but row numbers go up to ${highest}`,
    );
  }
  for (const c of cases.filter((x) => x.result === 'FAIL')) {
    messages.push(`${fileName}: FAIL #${c.n} ${c.label}`);
  }
  return { ok: messages.length === 0, cases: cases.length, messages };
}
