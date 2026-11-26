import { describe, expect, it } from 'vitest';

import fixture from '../../test/fixtures/pwa-colours.json';
import { oklchToHex, staffTokenValue, tokenHex } from './token-colour';
import { readTokenCss } from './token-file';

// add-pwa-install task 1.1 · design D2 · PW2 · AD-VIS-01: the manifest colours follow the token file. The
// expected hex values sit in a fixture file, because the lint rules keep colour literals out of the code.
const { colours, siteBackground } = fixture;

describe('oklch → hex (design D2)', () => {
  it.each(Object.entries(colours))('%s converts to its sRGB hex', (_name, { oklch, hex }) => {
    expect(oklchToHex(oklch)).toBe(hex);
  });

  it('Scenario: The colours come from the token file — --background of the real file is white', () => {
    expect(tokenHex(readTokenCss(), '--background')).toBe(colours.white.hex);
  });

  it('--primary of the real file is the neutral near-black of the icons (PW1)', () => {
    expect(tokenHex(readTokenCss(), '--primary')).toBe(colours.neutral.hex);
  });

  it('reads the staff :root block, not the site tree that comes later in the file', () => {
    const css = `:root {\n  --background: ${colours.white.oklch};\n}\n\n:root[data-tree='site'] {\n  --background: ${siteBackground};\n}\n`;
    expect(staffTokenValue(css, '--background')).toBe(colours.white.oklch);
  });

  it('a missing token throws', () => {
    expect(() =>
      tokenHex(`:root {\n  --foreground: ${colours.neutral.oklch};\n}\n`, '--background'),
    ).toThrow(/--background/);
  });

  it('a value that is not an oklch colour throws', () => {
    expect(() => oklchToHex(siteBackground)).toThrow(/Not an oklch colour/);
  });
});
