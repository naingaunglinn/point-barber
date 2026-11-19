import { describe, expect, it } from 'vitest';

import { SEP, evaluate } from '../lib/results.mjs';

// psql -qAt -0 -F <SEP> output of a *-test.sql file: records end with NUL, fields are SEP-separated;
// the void t() calls print empty records, the final query prints `n | label | expect | result | got`
// (design D4.9).
const row = (n, label, result) =>
  [n, label, result === 'PASS' ? 'ok' : 'fail', result, 'ok'].join(SEP);
const out = (...records) => records.join('\0') + '\0';

describe('add-repo-scaffold · platform-runtime · Database baseline equals the locked design', () => {
  it('Scenario: One failing case fails the job — a FAIL row is reported with file and label', () => {
    const result = evaluate(
      'part3-test.sql',
      out(row(1, '1 seed', 'PASS'), row(2, '2 business_date wrong', 'FAIL')),
    );
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['part3-test.sql: FAIL #2 2 business_date wrong']);
  });

  it('Scenario: One failing case fails the job — a file with no result row fails', () => {
    const result = evaluate('part4-test.sql', out('', '', ''));
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['part4-test.sql: no result row']);
  });
});

describe('constraint-test result parser (D4.9)', () => {
  it('passes when every row reads PASS', () => {
    expect(
      evaluate(
        'part3-test.sql',
        out('', '', row(1, '1 seed', 'PASS'), row(2, '2 duplicate code', 'PASS')),
      ),
    ).toEqual({
      ok: true,
      cases: 2,
      messages: [],
    });
  });

  it('keeps Myanmar text and pipes inside a label', () => {
    expect(evaluate('part3-test.sql', out(row(1, 'ဆိုးဆေး Ash | long', 'PASS')))).toEqual({
      ok: true,
      cases: 1,
      messages: [],
    });
  });

  // Review #12 — a line break inside a label must not hide a FAIL row.
  it('reads a FAIL row whose label spans two lines', () => {
    const result = evaluate(
      'part5-test.sql',
      out(row(1, 'ok', 'PASS'), row(2, 'line one\nline two', 'FAIL')),
    );
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['part5-test.sql: FAIL #2 line one\nline two']);
  });

  it('fails when result rows are missing (row numbers run past the rows read)', () => {
    const result = evaluate('part6-test.sql', out(row(1, 'a', 'PASS'), row(3, 'c', 'PASS')));
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual([
      'part6-test.sql: 2 result row(s) read, but row numbers go up to 3',
    ]);
  });
});
