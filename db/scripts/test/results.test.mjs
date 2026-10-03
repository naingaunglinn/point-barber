import { describe, expect, it } from 'vitest';

import { SEP, evaluate } from '../lib/results.mjs';

// psql -qAt -F <SEP> output of a *-test.sql file: the void t() calls print empty lines, the final
// query prints `n | label | expect | result | got` (design D4.9).
const row = (n, label, result) =>
  [n, label, result === 'PASS' ? 'ok' : 'fail', result, 'ok'].join(SEP);

describe('constraint-test result parser (D4.9)', () => {
  it('passes when every row reads PASS', () => {
    const out = ['', '', row(1, '1 seed', 'PASS'), row(2, '2 duplicate code', 'PASS')].join('\n');
    expect(evaluate('part3-test.sql', out)).toEqual({ ok: true, cases: 2, messages: [] });
  });

  it('fails with file name and label when one row reads FAIL', () => {
    const out = [row(1, '1 seed', 'PASS'), row(2, '2 business_date wrong', 'FAIL')].join('\n');
    const result = evaluate('part3-test.sql', out);
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['part3-test.sql: FAIL #2 2 business_date wrong']);
  });

  it('fails when the file produced no result row', () => {
    const result = evaluate('part4-test.sql', '\n\n\n');
    expect(result.ok).toBe(false);
    expect(result.messages).toEqual(['part4-test.sql: no result row']);
  });

  it('keeps Myanmar text and pipes inside a label', () => {
    const out = row(7, 'ဆိုးဆေး Ash | long', 'PASS');
    expect(evaluate('part3-test.sql', out)).toEqual({ ok: true, cases: 1, messages: [] });
  });
});
