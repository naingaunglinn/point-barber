import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Unit tests of packages/ui/tokens.css (task 1.9 · design D2 · AD-VIS-03 · D-UX-02 · FE-VIS-01a).
// The file is read as text: each top-level rule's selector and its custom-property declarations.

const ui = join(dirname(fileURLToPath(import.meta.url)), '..');

type Declarations = Map<string, string>;

/** Custom-property declarations of every top-level rule whose selector list is exactly `selector`. */
function declarationsOf(css: string, selector: string): Declarations {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const result: Declarations = new Map();
  let depth = 0;
  let start = 0;
  let header = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') {
      if (depth === 0) {
        header = text.slice(start, i).trim().replace(/\s+/g, ' ');
        start = i + 1;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        if (header === selector) {
          for (const match of text.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
            const [, name, value] = match;
            if (name !== undefined && value !== undefined) result.set(name, value.trim());
          }
        }
        start = i + 1;
      }
    }
  }
  return result;
}

const tokens = readFileSync(join(ui, 'tokens.css'), 'utf8');
const snapshot = readFileSync(join(ui, 'tokens.neutral.snapshot.css'), 'utf8');

const STAFF = ':root';
const SITE = ":root[data-tree='site']";
const staff = declarationsOf(tokens, STAFF);
const site = declarationsOf(tokens, SITE);
const neutral = declarationsOf(snapshot, ':root');

const isColour = (value: string) => /^(#|oklch\(|rgb\(|hsl\()/i.test(value);

/** A six-digit hex colour as its red, green and blue values. */
function rgbOf(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.replace(/^#/, ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

describe('tokens.css — the staff tree keeps the unchanged neutral values', () => {
  // The snapshot is the CLI's light theme. Its colour tokens are the requirement; `--radius` is not
  // a colour token, and AD-VIS-08 fixes it at 0.5rem (the CLI writes 0.625rem).
  const neutralColours = [...neutral].filter(([, value]) => isColour(value));

  it('the snapshot holds the Tailwind 4 neutral generation', () => {
    expect(neutral.get('--background')).toBe('oklch(1 0 0)');
    expect(neutral.get('--foreground')).toBe('oklch(0.145 0 0)');
    expect(neutral.get('--primary')).toBe('oklch(0.205 0 0)');
    expect(neutral.get('--destructive')).toBe('oklch(0.577 0.245 27.325)');
    expect(neutralColours.length).toBeGreaterThanOrEqual(23);
  });

  it.each(neutralColours)('staff %s equals the snapshot value %s', (name, value) => {
    expect(staff.get(name)).toBe(value);
  });

  it('the staff --ring and --input keep their neutral values', () => {
    expect(staff.get('--ring')).toBe('oklch(0.708 0 0)');
    expect(staff.get('--input')).toBe('oklch(0.922 0 0)');
  });

  it('--radius is 0.5rem (AD-VIS-08), not the CLI value', () => {
    expect(neutral.get('--radius')).toBe('0.625rem');
    expect(staff.get('--radius')).toBe('0.5rem');
  });
});

describe('tokens.css — staff tokens without a neutral value are aliases', () => {
  it.each([
    ['--success', 'var(--foreground)'],
    ['--warning', 'var(--foreground)'],
    ['--info', 'var(--foreground)'],
    ['--success-foreground', 'var(--background)'],
    ['--warning-foreground', 'var(--background)'],
    ['--info-foreground', 'var(--background)'],
    ['--success-subtle', 'var(--muted)'],
    ['--warning-subtle', 'var(--muted)'],
    ['--info-subtle', 'var(--muted)'],
    ['--danger-subtle', 'var(--muted)'],
    ['--destructive-foreground', 'var(--primary-foreground)'],
    ['--chart-6', 'var(--muted-foreground)'],
  ])('%s is %s', (name, alias) => {
    expect(staff.get(name)).toBe(alias);
  });

  it('declares no new colour beyond the snapshot', () => {
    const neutralNames = new Set(neutral.keys());
    const newColours = [...staff].filter(
      ([name, value]) => isColour(value) && !neutralNames.has(name),
    );
    expect(newColours.map(([name]) => name)).toEqual([]);
  });

  it('--decoration is not defined in the staff tree', () => {
    expect(staff.has('--decoration')).toBe(false);
  });
});

describe('tokens.css — the site block carries the website palette (FE-VIS-01a v1.7)', () => {
  // FE-VIS-01a in the form of the spec scenarios: rgb(238, 238, 238) = #EEEEEE.
  const PALETTE: Record<string, readonly [number, number, number]> = {
    '--background': [238, 238, 238],
    '--foreground': [0, 0, 0],
    '--decoration': [220, 95, 0],
    '--primary': [0, 0, 0],
    '--primary-foreground': [255, 255, 255],
    '--ring': [0, 0, 0],
    '--card': [255, 255, 255],
    '--card-foreground': [0, 0, 0],
    '--muted': [224, 224, 224],
    '--muted-foreground': [85, 85, 85],
    '--border': [196, 196, 196],
    '--input': [112, 112, 112],
    '--secondary': [255, 255, 255],
    '--secondary-foreground': [0, 0, 0],
    '--accent': [224, 224, 224],
    '--accent-foreground': [0, 0, 0],
    '--destructive': [200, 40, 27],
    '--destructive-foreground': [255, 255, 255],
    '--success': [14, 74, 40],
    '--success-foreground': [255, 255, 255],
    '--warning': [106, 58, 0],
    '--warning-foreground': [255, 255, 255],
    '--info': [11, 92, 173],
    '--info-foreground': [255, 255, 255],
  };

  it('holds exactly the 24 colour declarations with their values', () => {
    const colours = Object.fromEntries(
      [...site].filter(([, value]) => isColour(value)).map(([n, v]) => [n, rgbOf(v)]),
    );
    expect(colours).toEqual(PALETTE);
  });

  it('declares no other colour token (popover, the -subtle aliases and the charts stay)', () => {
    for (const name of ['--popover', '--popover-foreground', '--success-subtle', '--chart-1']) {
      expect(site.has(name)).toBe(false);
    }
  });
});

describe('tokens.css — fonts and the two component variables per tree', () => {
  it("--font-myanmar is 'Pyidaungsu' in both trees", () => {
    expect(declarationsOf(tokens, STAFF).get('--font-myanmar')).toBe("'Pyidaungsu'");
    expect(site.has('--font-myanmar')).toBe(false);
  });

  it('staff: the focus outline is --foreground and the input border --muted-foreground', () => {
    expect(staff.get('--focus-outline')).toBe('var(--foreground)');
    expect(staff.get('--field-border')).toBe('var(--muted-foreground)');
  });

  it('site: the focus outline is --ring and the input border --input', () => {
    expect(site.get('--focus-outline')).toBe('var(--ring)');
    expect(site.get('--field-border')).toBe('var(--input)');
  });
});
