// Parser for the result query that ends every point-sdd *-test.sql file (design D4.9):
//   SELECT n, label, expect, result ('PASS' | 'FAIL'), got FROM r ORDER BY n;
// The runner calls psql with -qAt -F SEP, so a result row is SEP-separated; the void t() calls
// print empty lines.
export const SEP = '\u001f';

export function evaluate(fileName, output) {
  const cases = [];
  for (const line of output.split(/\r?\n/)) {
    const fields = line.split(SEP);
    if (fields.length < 4) continue;
    const [n, label, , result] = fields;
    if (!/^\d+$/.test(n ?? '') || (result !== 'PASS' && result !== 'FAIL')) continue;
    cases.push({ n: Number(n), label, result });
  }
  const messages = [];
  if (cases.length === 0) messages.push(`${fileName}: no result row`);
  for (const c of cases.filter((x) => x.result === 'FAIL')) {
    messages.push(`${fileName}: FAIL #${c.n} ${c.label}`);
  }
  return { ok: messages.length === 0, cases: cases.length, messages };
}
