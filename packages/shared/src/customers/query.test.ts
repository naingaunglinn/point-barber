import { describe, expect, it } from 'vitest';

import { parseCustomerQuery } from './query.js';

// add-customer-management task 1.6 — customers "The list searches by name or by phone" (P3.CUS.01 ·
// D-CUS-06 · AD-FORM-10 · owner CM1 ★ · design D3 · R5). Ma Su = `+95977123456` (spec-fixtures §2).
describe('parseCustomerQuery — owner CM1', () => {
  it('Scenario: Part of the name — su is a name search', () => {
    expect(parseCustomerQuery('su')).toStrictEqual({ kind: 'name', pattern: 'su' });
  });

  it('Scenario: The last digits of the phone — 7712 3456 → 77123456', () => {
    expect(parseCustomerQuery('7712 3456')).toStrictEqual({ kind: 'phone', digits: '77123456' });
  });

  it('Scenario: The full number in another format — a leading 0 is read as 95', () => {
    expect(parseCustomerQuery('09-7712-3456')).toStrictEqual({
      kind: 'phone',
      digits: '95977123456',
    });
  });

  it('Scenario: Six Myanmar digits — ၀၉ ၇၇၁၂ → 9597712', () => {
    expect(parseCustomerQuery('၀၉ ၇၇၁၂')).toStrictEqual({ kind: 'phone', digits: '9597712' });
  });

  it('Scenario: Five digits are a name search', () => {
    expect(parseCustomerQuery('77123')).toStrictEqual({ kind: 'name', pattern: '77123' });
  });

  it('Scenario: Letters and digits together are a name search', () => {
    expect(parseCustomerQuery('Ma 0977')).toStrictEqual({ kind: 'name', pattern: 'Ma 0977' });
  });

  it('one leading + is a phone search on the digits, no 95 added', () => {
    expect(parseCustomerQuery('+95 9 7712')).toStrictEqual({ kind: 'phone', digits: '9597712' });
    expect(parseCustomerQuery('95+977123')).toStrictEqual({ kind: 'name', pattern: '95+977123' });
  });

  it('R5 — %, _ and \\ are escaped for the LIKE pattern', () => {
    expect(parseCustomerQuery('50%_off')).toStrictEqual({ kind: 'name', pattern: '50\\%\\_off' });
    expect(parseCustomerQuery('a\\b')).toStrictEqual({ kind: 'name', pattern: 'a\\\\b' });
  });

  it('a Myanmar name is a name search; the text is trimmed', () => {
    expect(parseCustomerQuery('  သီရိ ')).toStrictEqual({ kind: 'name', pattern: 'သီရိ' });
  });

  it('an empty or blank q is no filter', () => {
    expect(parseCustomerQuery('')).toBeNull();
    expect(parseCustomerQuery('   ')).toBeNull();
    expect(parseCustomerQuery(undefined)).toBeNull();
  });
});
