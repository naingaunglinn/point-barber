import { readFileSync } from 'node:fs';

// The fonts of every document (ADR-013 decision 2 · D-UX-02): Pyidaungsu Regular / Bold for Myanmar and
// Inter for Latin text and numbers, copied from packages/ui/fonts (built there by build-subsets.sh) with
// their licence files. The renderer blocks every network request, so the faces are inlined as data URIs;
// it waits for `document.fonts.ready`, so no document is drawn with a fallback font.

/** The CSS family list: Latin from Inter, Myanmar from Pyidaungsu. */
export const DOCUMENT_FONT_FAMILY = 'Inter, Pyidaungsu';

const FACES = [
  { family: 'Inter', file: 'inter-latin.woff2', weight: '400 700' },
  { family: 'Pyidaungsu', file: 'pyidaungsu-regular.woff2', weight: '400' },
  { family: 'Pyidaungsu', file: 'pyidaungsu-bold.woff2', weight: '700' },
] as const;

/** A font file of this package (`fonts/`), from the source or the built tree alike. */
export function fontFile(file: string): Buffer {
  return readFileSync(new URL(`../fonts/${file}`, import.meta.url));
}

let css: string | undefined;

/** The @font-face rules with the fonts inlined; read once per process. */
export function fontFaceCss(): string {
  css ??= FACES.map(
    ({ family, file, weight }) =>
      `@font-face{font-family:${family};font-style:normal;font-weight:${weight};font-display:block;` +
      `src:url(data:font/woff2;base64,${fontFile(file).toString('base64')}) format("woff2")}`,
  ).join('\n');
  return css;
}
