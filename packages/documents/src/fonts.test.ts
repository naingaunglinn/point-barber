import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { receiptBaseCss, RECEIPT_BODY_PX } from './base-css.js';
import { fontFaceCss, fontFile } from './fonts.js';

// add-walkin-visit-checkout task 9.1 — the fonts ship with the package and their licence files
// (ADR-013 decision 2 · D-UX-02); the base style lays a receipt out at the printer's dots with body
// text of at least 22 px at 384 px (AD-RCPT-02).
const faces = () => [
  ...fontFaceCss().matchAll(/font-family:(\w+);[^}]*font-weight:([\d ]+);[^}]*base64,([^)]+)\)/g),
];

describe('fonts (ADR-013 decision 2)', () => {
  it('Pyidaungsu Regular and Bold and Inter, inlined as WOFF2', () => {
    expect(faces().map(([, family, weight]) => `${family} ${weight}`)).toStrictEqual([
      'Inter 400 700',
      'Pyidaungsu 400',
      'Pyidaungsu 700',
    ]);
    for (const [, , , data] of faces()) {
      expect(
        Buffer.from(data ?? '', 'base64')
          .subarray(0, 4)
          .toString('latin1'),
      ).toBe('wOF2');
    }
  });

  it('the inlined bytes are the files of fonts/', () => {
    const [inter] = faces();
    expect(Buffer.from(inter?.[3] ?? '', 'base64').equals(fontFile('inter-latin.woff2'))).toBe(
      true,
    );
  });

  it('each family has its licence file next to it', () => {
    for (const licence of ['LICENSE-Pyidaungsu.txt', 'OFL-Inter.txt']) {
      expect(existsSync(new URL(`../fonts/${licence}`, import.meta.url))).toBe(true);
    }
  });
});

describe('receiptBaseCss (AD-RCPT-02)', () => {
  it.each([
    [58, 384],
    [80, 576],
  ] as const)('%i mm paper: the body is %i px wide', (paper, px) => {
    expect(receiptBaseCss(paper)).toContain(`body{width:${px}px;`);
  });

  it('body text at least 22 px, black on white, with the fonts', () => {
    const css = receiptBaseCss(58);
    expect(RECEIPT_BODY_PX).toBeGreaterThanOrEqual(22);
    expect(css).toContain(`font-size:${RECEIPT_BODY_PX}px`);
    expect(css).toContain('background:white;color:black');
    expect(css).toContain('font-family:Inter, Pyidaungsu');
    expect(css.startsWith(fontFaceCss())).toBe(true);
  });
});
