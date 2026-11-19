import { describe, expect, it } from 'vitest';

import { initialsOf } from './initials.js';

// ui-foundation "An employee chip never shows an avatar without the name" (AD-CMP-09 · design D8).
describe('initialsOf', () => {
  it('takes the first letter of the first two Latin words, upper-cased', () => {
    expect(initialsOf('Ko Aung')).toBe('KA');
    expect(initialsOf('U Kyaw Zin')).toBe('UK');
    expect(initialsOf('ma hnin')).toBe('MH');
    expect(initialsOf('Thida')).toBe('T');
  });

  it('takes the first grapheme cluster of a Myanmar-script name', () => {
    expect(initialsOf('ကိုအောင်')).toBe('ကို');
    expect(initialsOf('မနှင်း')).toBe('မ');
    expect(initialsOf('ဦးကျော်ဇင်')).toBe('ဦ');
  });

  it('is empty for an empty name', () => {
    expect(initialsOf('  ')).toBe('');
  });
});
