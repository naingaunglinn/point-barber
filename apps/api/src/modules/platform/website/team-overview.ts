import { Injectable } from '@nestjs/common';
import { type TeamProfile, todayMmt, toMmtIsoMillis } from '@point/shared';

import type { GrantSet } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { SiteContentReader } from './site-content-reader.js';
import { WebsiteDirectory, type WebsiteProfile, WebsiteShifts } from './website-ports.js';

// P8.WEB.09 — every ACTIVE employee's public profile (P8-RULE-11 · owner WM5 ★ · design D8):
// `shown_on_site` = `site.show_barbers` ∧ `public_profile` as written; `today_branches` by the rule of
// P8.PUB.04 through `TodayShifts.branchesOf`; `actions` from the caller's `employee.update` /
// `employee.rating_update` covering the employee. Each member is named, so no phone, e-mail or note
// can reach the response.

/** `employee.*` code `code` reaches the employee: one of its open branches, or company scope (P1-RULE-11). */
function reaches(grants: GrantSet, code: string, profile: WebsiteProfile): boolean {
  return (
    grants.isCompany(code) || profile.branches.some((branch) => grants.covers(code, branch.id))
  );
}

@Injectable()
export class TeamOverviewReader {
  constructor(
    private readonly directory: WebsiteDirectory,
    private readonly shifts: WebsiteShifts,
    private readonly content: SiteContentReader,
    private readonly clock: Clock,
  ) {}

  async list(grants: GrantSet): Promise<{ items: TeamProfile[] }> {
    const [profiles, content] = await Promise.all([
      this.directory.activeProfiles(),
      this.content.read(),
    ]);
    const today = await this.shifts.branchesOf({
      employee_ids: profiles.map((profile) => profile.employee_id),
      date: todayMmt(this.clock.now()),
    });
    return {
      items: profiles.map((profile) => ({
        employee_id: profile.employee_id,
        employee_code: profile.employee_code,
        name_mm: profile.name_mm,
        name_en: profile.name_en,
        photo_url: profile.photo_url,
        public_profile: profile.public_profile,
        public_specialty_mm: profile.public_specialty_mm,
        public_specialty_en: profile.public_specialty_en,
        public_rating: profile.public_rating,
        branches: profile.branches.map((branch) => ({
          code: branch.code,
          name_mm: branch.name_mm,
          name_en: branch.name_en,
        })),
        today_branches: (today.get(profile.employee_id) ?? []).map((branch) => ({
          code: branch.code,
          name_mm: branch.name_mm,
          name_en: branch.name_en,
          starts_at: toMmtIsoMillis(branch.starts_at),
          ends_at: toMmtIsoMillis(branch.ends_at),
        })),
        shown_on_site: content.show_barbers && profile.public_profile,
        actions: {
          can_edit_profile: reaches(grants, 'employee.update', profile),
          can_rate: reaches(grants, 'employee.rating_update', profile),
        },
      })),
    };
  }
}
