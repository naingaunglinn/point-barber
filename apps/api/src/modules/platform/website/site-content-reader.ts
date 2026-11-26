import { Inject, Injectable } from '@nestjs/common';
import { SETTINGS, type SiteContent, settingEntry, siteContentSchema, toMmtIsoMillis } from '@point/shared';
import type { Logger } from 'pino';

import { AppConfig } from '../../../common/config/config.js';
import { LOGGER } from '../../../common/logging/logger.js';
import { SettingsRepository } from '../repositories/settings.repository.js';
import { CompanyOfSettings } from '../settings/ports.js';
import { type StoredSetting, resolveSetting } from '../settings/resolve.js';
import { wellFormedRows } from '../settings/well-formed.js';
import { WebsitePeople } from './website-people.js';

// The nine `site.*` keys as one `SiteContent` (P8.WEB.01 / 02 · P8-RULE-11 · add-website-management
// design D4): each key's row or its Part 8 §17 default, the newest row's `updated_at` / `updated_by`,
// `site_origin` and `live_within_seconds`. The two image members stay null until part A6 maps the
// attachments through `publicMediaPath` — no image setting can exist before then.

/** "Live on the website within a few seconds" (P8-RULE-11): the number the form shows. */
export const LIVE_WITHIN_SECONDS = 10;

const SITE_KEYS = SETTINGS.map((entry) => entry.key).filter((key) => key.startsWith('site.'));

/** The newest row of a set (`updated_at`, then id), or undefined for none. */
export function newestSetting(rows: readonly StoredSetting[]): StoredSetting | undefined {
  return rows.reduce<StoredSetting | undefined>(
    (newest, row) => (newest === undefined || row.updated_at > newest.updated_at ? row : newest),
    undefined,
  );
}

/** The user ids a `SiteContent` names: the writer of the newest row. */
export function siteContentUserIds(rows: readonly StoredSetting[]): string[] {
  const newest = newestSetting(rows);
  return newest === undefined ? [] : [newest.updated_by_user_id];
}

/** Pure: the content of `rows` (the stored `site.*` rows, any order) — the unit under test of task 5.1. */
export function siteContentOf(
  rows: readonly StoredSetting[],
  options: { readonly siteOrigin: string; readonly names: ReadonlyMap<string, string> },
): SiteContent {
  const value = (key: string): unknown => resolveSetting(settingEntry(key), rows).effective;
  const newest = newestSetting(rows);
  return siteContentSchema.parse({
    hero_title: value('site.hero_title'),
    hero_subtitle: value('site.hero_subtitle'),
    cover_image: null,
    share_image: null,
    seo_title: value('site.seo_title'),
    seo_description: value('site.seo_description'),
    announcement: value('site.announcement'),
    show_prices: value('site.show_prices'),
    show_barbers: value('site.show_barbers'),
    site_origin: options.siteOrigin,
    updated_at: newest === undefined ? null : toMmtIsoMillis(newest.updated_at),
    updated_by:
      newest === undefined
        ? null
        : {
            user_id: newest.updated_by_user_id,
            display_name: options.names.get(newest.updated_by_user_id) ?? '',
          },
    live_within_seconds: LIVE_WITHIN_SECONDS,
  });
}

@Injectable()
export class SiteContentReader {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly company: CompanyOfSettings,
    private readonly people: WebsitePeople,
    private readonly config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  async read(): Promise<SiteContent> {
    const companyId = await this.company.id();
    const rows =
      companyId === null
        ? []
        : wellFormedRows(await this.settings.rowsOf(companyId, SITE_KEYS, null), this.log);
    return siteContentOf(rows, {
      siteOrigin: this.config.env.SITE_ORIGIN,
      names: await this.people.userDisplayNames(siteContentUserIds(rows)),
    });
  }
}
