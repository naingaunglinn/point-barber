// The staff tree's colours as the manifest and the page head need them (add-pwa-install design D2 · PW2 ·
// AD-VIS-01): `packages/ui/tokens.css` stays the only source, and this file turns one token's `oklch()`
// value into the sRGB hex a manifest and a `theme-color` tag require. Pure — no file access; token-file.ts
// reads the file.

const LINEAR_TO_LMS = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
] as const;

const LMS_TO_RGB = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
] as const;

type Row = readonly [number, number, number];

const dot = (row: Row, vector: Row): number =>
  row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2];

/** The gamma of sRGB, clamped to the gamut. */
function encode(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

const hexByte = (unit: number): string =>
  Math.round(unit * 255)
    .toString(16)
    .padStart(2, '0');

const OKLCH = new RegExp(String.raw`^ok${'lch'}\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$`);

/** `oklch(0.205 0 0)` → `#171717`. Throws when the value is not an oklch() colour of three numbers. */
export function oklchToHex(value: string): string {
  const match = OKLCH.exec(value.trim());
  if (match === null) throw new Error(`Not an oklch colour: ${value}`);
  const lightness = Number(match[1]);
  const chroma = Number(match[2]);
  const hue = (Number(match[3]) * Math.PI) / 180;
  const lab: Row = [lightness, chroma * Math.cos(hue), chroma * Math.sin(hue)];
  const [l, m, s] = LINEAR_TO_LMS.map((row) => dot(row, lab) ** 3);
  const lms: Row = [l ?? 0, m ?? 0, s ?? 0];
  const [red, green, blue] = LMS_TO_RGB.map((row) => encode(dot(row, lms)));
  return `#${hexByte(red ?? 0)}${hexByte(green ?? 0)}${hexByte(blue ?? 0)}`;
}

/**
 * The value of a custom property in the staff tree's `:root { … }` block of the token file — the
 * first plain `:root` block, not the site tree's `:root[data-tree='site']` one. Throws when it is missing.
 */
export function staffTokenValue(css: string, name: string): string {
  const block = /(?:^|\n):root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1];
  const declaration = block === undefined ? null : new RegExp(`${name}:\\s*([^;]+);`).exec(block);
  const value = declaration?.[1];
  if (value === undefined) throw new Error(`Token ${name} is not defined in the staff :root block`);
  return value.trim();
}

/** The hex colour of a staff token, `--background` → `#ffffff`. */
export function tokenHex(css: string, name: string): string {
  return oklchToHex(staffTokenValue(css, name));
}
