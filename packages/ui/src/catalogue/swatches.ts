import type { Tree } from '../fonts';

// The swatches of the catalogue's Tokens section (AD-VIS-01 · AD-VIS-03 · design D2): every colour
// token of tokens.css, in file order, with the token it is an alias of. swatches.test.ts keeps these
// lists equal to the file.

type Token = `--${string}`;

/** The colour tokens of the staff block; the site block overrides some and adds `--decoration`. */
export const COLOUR_TOKENS: readonly Token[] = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  '--success',
  '--warning',
  '--info',
  '--success-foreground',
  '--warning-foreground',
  '--info-foreground',
  '--success-subtle',
  '--warning-subtle',
  '--info-subtle',
  '--danger-subtle',
  '--destructive-foreground',
  '--chart-6',
  '--focus-outline',
  '--field-border',
];

/** Site only (FE-VIS-01a): large text and icons on the background or a card (FE-VIS-01b). */
export const SITE_ONLY_TOKENS: readonly Token[] = ['--decoration'];

export function swatchTokens(tree: Tree): readonly Token[] {
  return tree === 'site' ? [...COLOUR_TOKENS, ...SITE_ONLY_TOKENS] : COLOUR_TOKENS;
}

/** `var(--x)` declarations per tree: the site block keeps the staff aliases it does not override. */
export const ALIASES: Readonly<Record<Tree, Readonly<Partial<Record<Token, Token>>>>> = {
  staff: {
    '--success': '--foreground',
    '--warning': '--foreground',
    '--info': '--foreground',
    '--success-foreground': '--background',
    '--warning-foreground': '--background',
    '--info-foreground': '--background',
    '--success-subtle': '--muted',
    '--warning-subtle': '--muted',
    '--info-subtle': '--muted',
    '--danger-subtle': '--muted',
    '--destructive-foreground': '--primary-foreground',
    '--chart-6': '--muted-foreground',
    '--focus-outline': '--foreground',
    '--field-border': '--muted-foreground',
  },
  site: {
    '--success-subtle': '--muted',
    '--warning-subtle': '--muted',
    '--info-subtle': '--muted',
    '--danger-subtle': '--muted',
    '--chart-6': '--muted-foreground',
    '--focus-outline': '--ring',
    '--field-border': '--input',
  },
};

/**
 * Staff aliases that stand for a colour of admin §3.1 the owner has not given yet (`{{COLOR_*}}` —
 * OPEN-30): their row carries the note "owner value pending (OPEN-30)".
 */
export const PENDING_OWNER_VALUE: readonly Token[] = [
  '--success',
  '--warning',
  '--info',
  '--success-foreground',
  '--warning-foreground',
  '--info-foreground',
  '--success-subtle',
  '--warning-subtle',
  '--info-subtle',
  '--danger-subtle',
];
