import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { fontPreloads } from './fonts';

const ui = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(join(ui, 'tokens.css'), 'utf8');
const fontFaceUrls = [...tokens.matchAll(/url\('([^']+)'\) format\('woff2'\)/g)].flatMap((m) =>
  m[1] === undefined ? [] : [m[1]],
);

// FE-PERF-06 · design D3: preload only the fonts used above the fold in the current language.
describe('fontPreloads', () => {
  it.each([
    ['staff', 'en', ['/fonts/manrope-latin.woff2', '/fonts/inter-latin.woff2']],
    ['staff', 'my', ['/fonts/pyidaungsu-regular.woff2', '/fonts/pyidaungsu-bold.woff2']],
    ['site', 'en', ['/fonts/archivo-black-latin.woff2', '/fonts/roboto-latin.woff2']],
    ['site', 'my', ['/fonts/pyidaungsu-regular.woff2', '/fonts/pyidaungsu-bold.woff2']],
  ] as const)('%s / %s preloads %j', (tree, locale, hrefs) => {
    expect(fontPreloads(tree, locale)).toEqual(hrefs.map((href) => ({ href, type: 'font/woff2' })));
  });

  it('preloads only URLs that an @font-face rule of tokens.css loads, from a committed file', () => {
    for (const tree of ['staff', 'site'] as const) {
      for (const locale of ['my', 'en'] as const) {
        for (const { href } of fontPreloads(tree, locale)) {
          expect(fontFaceUrls).toContain(href);
          expect(existsSync(join(ui, 'fonts', href.replace('/fonts/', '')))).toBe(true);
        }
      }
    }
  });

  it('every @font-face rule loads a committed WOFF2 file from the own origin', () => {
    expect(fontFaceUrls).toHaveLength(6);
    for (const url of fontFaceUrls) {
      expect(url).toMatch(/^\/fonts\/[a-z0-9-]+\.woff2$/);
      expect(existsSync(join(ui, 'fonts', url.replace('/fonts/', '')))).toBe(true);
    }
  });
});
