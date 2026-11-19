'use client';

import { useTranslations } from 'next-intl';

import type { Messages } from '@point/i18n';

import { BRANCH_CODES } from '../../lib/branches/access';
import { useCan } from '../../lib/session/grants';
import { seesCompany } from './company-access';

// The Settings menu (AD-NAV-02 · AD-NAV-03 · add-company-profile design D8 and "Shared pieces" — the
// first Dev 1 wave-1 change to merge creates it, the others add their screen): one list of screens,
// in the order of AD-NAV-02's Settings row, read by the rail's Settings module (last, from 768 px)
// and by the Settings list of the More screen (phone). A screen is shown only to a user whose grants
// reach it (AD-NAV-02 · AD-PERM-02 — hidden, never disabled); with no screen shown, Settings itself
// is hidden. Each screen's label is `settings.nav.<key>`.

type Can = ReturnType<typeof useCan>;

/** The item keys of `settings.nav` — every key but the menu's own title. */
export type SettingsScreenKey = Exclude<keyof Messages['settings']['nav'], 'title'>;

interface SettingsScreenEntry {
  readonly key: SettingsScreenKey;
  readonly href: string;
  /** Whether the user's grants show the screen (can() — AD-PERM-03). */
  readonly visible: (can: Can) => boolean;
}

/** The screens of Settings, in AD-NAV-02 order. Each change adds its own entry here. */
const SCREENS: readonly SettingsScreenEntry[] = [
  // add-company-profile — any `company.*` code (AD-NAV-02 · design D8).
  { key: 'company', href: '/settings/company', visible: seesCompany },
  // add-branch-management — Settings › Branches for a holder of any branch.* code at any scope
  // (branch.view⁺ — AD-PERM-03 · design D9).
  {
    key: 'branches',
    href: '/settings/branches',
    visible: (can) => BRANCH_CODES.some((code) => can(code)),
  },
  // add-settings-store — Additional settings for any `settings.*` code (settings.view⁺, mixed — design
  // D10); Maintenance mode for company-scope settings.update only (P1.SYS.03 · AD-NAV-08), last.
  {
    key: 'additional',
    href: '/settings/additional',
    visible: (can) => can('settings.view') || can('settings.update'),
  },
  {
    key: 'maintenance',
    href: '/settings/maintenance',
    visible: (can) => can('settings.update', { level: 'company' }),
  },
];

export interface SettingsScreen {
  readonly key: SettingsScreenKey;
  /** Translated. */
  readonly label: string;
  readonly href: string;
}

/** The Settings screens the signed-in user may open, in menu order. */
export function useSettingsScreens(): readonly SettingsScreen[] {
  const t = useTranslations('settings.nav');
  const can = useCan();
  return SCREENS.filter((screen) => screen.visible(can)).map((screen) => ({
    key: screen.key,
    label: t(screen.key),
    href: screen.href,
  }));
}

/** The screen the path belongs to (`/settings/company` and below), if any. */
export function settingsScreenOf(
  screens: readonly SettingsScreen[],
  pathname: string,
): SettingsScreen | undefined {
  return screens.find(
    (screen) => pathname === screen.href || pathname.startsWith(`${screen.href}/`),
  );
}
