import { describe, expect, it } from 'vitest';

import { referenceHint } from './reference-hint';

// AD-FORM-12 — the expected format of a reference, read from the method's pattern.
describe('referenceHint', () => {
  it('the fixture KBZPay pattern ^KBZ[0-9]{10}$ → KBZ followed by 10 digits', () => {
    expect(referenceHint('^KBZ[0-9]{10}$')).toStrictEqual({
      kind: 'prefixDigits',
      prefix: 'KBZ',
      count: 10,
    });
  });

  it('digits only: ^\\d{12}$ → 12 digits', () => {
    expect(referenceHint('^\\d{12}$')).toStrictEqual({ kind: 'digits', count: 12 });
  });

  it('no pattern, or one it cannot describe → no helper', () => {
    expect(referenceHint(null)).toBeNull();
    expect(referenceHint('^[A-Z]{2}-\\d+$')).toBeNull();
  });
});
