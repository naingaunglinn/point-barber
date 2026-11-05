'use client';

import { useTranslations } from 'next-intl';

import type { SettingSource } from '@point/shared';

// Where an effective value comes from (AD-SET-01 · design D10): Default, Company or Branch override, as a
// neutral badge in the existing tokens only (D-UX-02). Design D10 names a neutral FlagChip; FlagChip
// renders only the status map's flags and their `status.flag.*` texts, and the owner-approved texts are
// `settings.source.*` (05/Nov/2026), so the badge is this screen's own — the FlagChip shape, no icon.
export function SourceBadge({ source }: Readonly<{ source: SettingSource }>) {
  const t = useTranslations('settings.source');
  return (
    <span
      data-slot="setting-source"
      data-source={source}
      className="inline-flex max-w-full items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-foreground"
    >
      {t(source)}
    </span>
  );
}
