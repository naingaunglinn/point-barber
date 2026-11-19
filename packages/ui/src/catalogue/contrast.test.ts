import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { Tree } from '../fonts';
import { declarationsOf } from '../test/css-declarations';
import { CONTRAST_PAIRS, contrastRatio, markOf, type ContrastPair, type Rgb } from './contrast';
import { ALIASES, COLOUR_TOKENS, PENDING_OWNER_VALUE, SITE_ONLY_TOKENS } from './swatches';

// add-shared-ui-components task 4.4 · ui-foundation "The catalogue reports the contrast of each token
// pair" (AD-VIS-04 · AD-A11Y-02 · FE-VIS-01a · FE-VIS-01b · design D2). The browser resolves the
// colours itself; this test resolves the same tokens from tokens.css and checks the ratios against
// the table of design D2 — and that no pair fails.

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../tokens.css'), 'utf8');
const staff = declarationsOf(css, ':root');
const site = new Map([...staff, ...declarationsOf(css, ":root[data-tree='site']")]);
const TREES: Readonly<Record<Tree, Map<string, string>>> = { staff, site };

/** OKLCH → 8-bit sRGB (Björn Ottosson's OKLab matrices), clipped to the sRGB gamut. */
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [red = 0, green = 0, blue = 0] = linear.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  return [red, green, blue];
}

/** The 8-bit sRGB colour of a token in a tree, following `var(--x)` aliases. */
function resolve(tree: Tree, token: string): Rgb {
  const value = TREES[tree].get(token);
  if (value === undefined) throw new Error(`${token} is not declared for ${tree}`);
  const alias = /^var\((--[\w-]+)\)$/.exec(value);
  if (alias?.[1] !== undefined) return resolve(tree, alias[1]);
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1] !== undefined) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const oklch = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (oklch) return oklchToRgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  throw new Error(`${token}: unexpected value ${value}`);
}

const ratioOf = (tree: Tree, pair: ContrastPair) =>
  contrastRatio(resolve(tree, pair.foreground), resolve(tree, pair.background));

const row = (pair: ContrastPair) =>
  `${pair.kind} ${pair.foreground}${pair.via === undefined ? '' : `=${pair.via}`} on ${pair.background}`;

describe('contrastRatio', () => {
  it('is 21 for black on white, 1 for a colour on itself, and the same both ways round', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBe(21);
    expect(contrastRatio([238, 238, 238], [238, 238, 238])).toBe(1);
    expect(contrastRatio([85, 85, 85], [238, 238, 238])).toBe(
      contrastRatio([238, 238, 238], [85, 85, 85]),
    );
  });
});

describe('the contrast table of design D2', () => {
  it('has 6 staff rows and 20 site rows', () => {
    expect(CONTRAST_PAIRS.staff).toHaveLength(6);
    expect(CONTRAST_PAIRS.site).toHaveLength(20);
  });

  it('Scenario: Staff pairs — the ratios of the Tailwind 4 neutral values, none failing', () => {
    expect(CONTRAST_PAIRS.staff.map((pair) => [row(pair), ratioOf('staff', pair)])).toEqual([
      ['text --foreground on --background', 19.8],
      ['text --muted-foreground on --background', 4.74],
      ['text --primary-foreground on --primary', 17.18],
      ['text --destructive on --background', 4.77],
      ['outline --focus-outline=--foreground on --background', 19.8],
      ['border --field-border=--muted-foreground on --background', 4.74],
    ]);
  });

  it('Scenarios: Site text, status, outline, border and decoration pairs', () => {
    expect(CONTRAST_PAIRS.site.map((pair) => [row(pair), ratioOf('site', pair)])).toEqual([
      ['text --foreground on --background', 18.1],
      ['text --primary-foreground on --primary', 21],
      ['text --muted-foreground on --background', 6.43],
      ['text --muted-foreground on --muted', 5.65],
      ['text --destructive on --background', 4.79],
      ['text --destructive-foreground on --destructive', 5.56],
      ['text --success on --background', 8.92],
      ['text --success-foreground on --success', 10.35],
      ['text --warning on --background', 8.16],
      ['text --warning-foreground on --warning', 9.47],
      ['text --info on --background', 5.75],
      ['text --info-foreground on --info', 6.67],
      ['outline --focus-outline=--ring on --background', 18.1],
      ['border --field-border=--input on --background', 4.27],
      ['border --field-border=--input on --card', 4.95],
      ['text --decoration on --background', 3.19],
      ['text --decoration on --card', 3.7],
      ['text --decoration on --muted', 2.8],
      ['text --primary-foreground on --decoration', 3.7],
      ['text --foreground on --decoration', 5.68],
    ]);
  });

  it.each(['staff', 'site'] as const)('Scenario: No %s pair fails', (tree) => {
    const marks = CONTRAST_PAIRS[tree].map((pair) => markOf(pair, ratioOf(tree, pair)));
    expect(marks).not.toContain('fail');
    const limited = CONTRAST_PAIRS[tree].filter((_, i) => marks[i] !== 'pass');
    for (const pair of limited)
      expect(pair.foreground === '--decoration' || pair.background === '--decoration').toBe(true);
  });

  it('marks the decoration rows: large text and icons only, or not allowed', () => {
    expect(
      CONTRAST_PAIRS.site.map((pair) => markOf(pair, ratioOf('site', pair))).slice(15),
    ).toEqual(['largeOnly', 'largeOnly', 'notAllowed', 'notAllowed', 'pass']);
  });

  it('marks a used pair below its limit as failing — values are never changed to pass', () => {
    const [foreground] = CONTRAST_PAIRS.staff;
    expect(foreground && markOf(foreground, 4.49)).toBe('fail');
    expect(foreground && markOf(foreground, 4.5)).toBe('pass');
  });
});

describe('the swatches', () => {
  const colour = (value: string) => /^(#|oklch\(|var\(--)/.test(value);

  it('list every colour token of the staff block, in file order, and the site-only one', () => {
    expect(COLOUR_TOKENS).toEqual([...staff].filter(([, v]) => colour(v)).map(([k]) => k));
    const siteBlock = declarationsOf(css, ":root[data-tree='site']");
    expect([...siteBlock.keys()].filter((k) => !staff.has(k))).toEqual(SITE_ONLY_TOKENS);
  });

  it.each(['staff', 'site'] as const)(
    'name the alias of every var() token in the %s tree',
    (tree) => {
      const aliases = Object.fromEntries(
        [...TREES[tree]]
          .map(([token, value]) => [token, /^var\((--[\w-]+)\)$/.exec(value)?.[1]] as const)
          .filter(
            ([token, target]) =>
              target !== undefined && COLOUR_TOKENS.includes(token as `--${string}`),
          ),
      );
      expect(ALIASES[tree]).toEqual(aliases);
    },
  );

  it('Scenario: Tokens without a neutral value are aliases — success, warning, info, subtle', () => {
    for (const token of ['--success', '--warning', '--info'] as const) {
      expect(resolve('staff', token)).toEqual(resolve('staff', '--foreground'));
    }
    expect(resolve('staff', '--success-subtle')).toEqual(resolve('staff', '--muted'));
    for (const token of ['--success', '--warning', '--info', '--success-subtle'] as const) {
      expect(PENDING_OWNER_VALUE).toContain(token);
    }
  });
});
