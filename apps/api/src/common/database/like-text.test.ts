import { describe, expect, it } from 'vitest';

import { likeText } from './like-text.js';

describe('likeText', () => {
  it('escapes the ILIKE wildcards and the escape character; other text is unchanged', () => {
    expect(likeText('Hair wash')).toBe('Hair wash');
    expect(likeText('100%')).toBe('100\\%');
    expect(likeText('a_b')).toBe('a\\_b');
    expect(likeText('a\\b')).toBe('a\\\\b');
    expect(likeText('ဆံပင်')).toBe('ဆံပင်');
  });
});
