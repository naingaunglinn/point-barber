import type { Tree } from '../fonts';

// The contrast table of the catalogue's Tokens section (AD-VIS-04 · AD-A11Y-02 · FE-VIS-01a ·
// FE-VIS-01b · design D2): each pair's WCAG ratio, computed in the browser from the resolved 8-bit
// sRGB colours, rounded to 2 decimals, with the limit of the pair. Token values are never changed to
// pass; a pair below its limit is marked.

export type Rgb = readonly [number, number, number];

/** WCAG 2 relative luminance of an 8-bit sRGB colour. */
export function relativeLuminance([red, green, blue]: Rgb): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue);
}

/** WCAG contrast ratio of two colours, rounded to 2 decimals: 19.8 for `#0a0a0a` on white. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return Math.round((((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)) * 100) / 100;
}

/**
 * What a pair is for. `text` and `outline` / `border` pairs must reach their limit; the `--decoration`
 * rows of the site are usage limits (FE-VIS-01b): `largeOnly` = large text and icons only,
 * `notAllowed` = the combination is never used.
 */
export type PairKind = 'text' | 'outline' | 'border';
export type PairUsage = 'normal' | 'largeOnly' | 'notAllowed';

export interface ContrastPair {
  readonly kind: PairKind;
  /** The token drawn: text colour, outline colour or border colour. */
  readonly foreground: `--${string}`;
  /** The surface it is drawn on. */
  readonly background: `--${string}`;
  /** For the focus outline and the input border: the token the component variable points at. */
  readonly via?: `--${string}`;
  readonly limit: 4.5 | 3;
  readonly usage: PairUsage;
}

const text = (
  foreground: `--${string}`,
  background: `--${string}` = '--background',
  usage: PairUsage = 'normal',
): ContrastPair => ({ kind: 'text', foreground, background, limit: 4.5, usage });

const large = (
  foreground: `--${string}`,
  background: `--${string}`,
  usage: PairUsage,
): ContrastPair => ({ kind: 'text', foreground, background, limit: 3, usage });

const outline = (via: `--${string}`): ContrastPair => ({
  kind: 'outline',
  foreground: '--focus-outline',
  background: '--background',
  via,
  limit: 3,
  usage: 'normal',
});

const border = (via: `--${string}`, background: `--${string}` = '--background'): ContrastPair => ({
  kind: 'border',
  foreground: '--field-border',
  background,
  via,
  limit: 3,
  usage: 'normal',
});

/** The pairs of design D2: 6 staff rows and 20 site rows. */
export const CONTRAST_PAIRS: Readonly<Record<Tree, readonly ContrastPair[]>> = {
  staff: [
    text('--foreground'),
    text('--muted-foreground'),
    text('--primary-foreground', '--primary'),
    text('--destructive'),
    outline('--foreground'),
    border('--muted-foreground'),
  ],
  site: [
    text('--foreground'),
    text('--primary-foreground', '--primary'),
    text('--muted-foreground'),
    text('--muted-foreground', '--muted'),
    text('--destructive'),
    text('--destructive-foreground', '--destructive'),
    text('--success'),
    text('--success-foreground', '--success'),
    text('--warning'),
    text('--warning-foreground', '--warning'),
    text('--info'),
    text('--info-foreground', '--info'),
    outline('--ring'),
    border('--input'),
    border('--input', '--card'),
    large('--decoration', '--background', 'largeOnly'),
    large('--decoration', '--card', 'largeOnly'),
    large('--decoration', '--muted', 'notAllowed'),
    text('--primary-foreground', '--decoration', 'notAllowed'),
    text('--foreground', '--decoration'),
  ],
};

export type ContrastMark = 'pass' | 'largeOnly' | 'notAllowed' | 'fail';

/** The mark of a row: `fail` when a pair that is used does not reach its limit. */
export function markOf(pair: ContrastPair, ratio: number): ContrastMark {
  if (pair.usage === 'notAllowed') return 'notAllowed';
  if (ratio < pair.limit) return 'fail';
  return pair.usage === 'largeOnly' ? 'largeOnly' : 'pass';
}
