import { Injectable } from '@nestjs/common';
import { type WebsiteOverview, todayMmt } from '@point/shared';

import { type GrantSet, type Scope, reaches } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import {
  BranchClosuresRepository,
  type ClosureRow,
} from '../repositories/branch-closures.repository.js';
import { OpeningHoursRepository } from '../repositories/opening-hours.repository.js';
import { SiteContentReader } from './site-content-reader.js';
import { WebsiteCatalog, WebsiteDirectory } from './website-ports.js';

// P8.WEB.01 — the overview (P8-RULE-11 · AD-WEB-02 · add-website-management proposal reading 9): the
// content, the ACTIVE branches of the caller's `website.*` grant with their hours and next closure, the
// company's counts and what the caller may do. The counts are company facts, not filtered by the grant.
@Injectable()
export class WebsiteOverviewReader {
  constructor(
    private readonly content: SiteContentReader,
    private readonly directory: WebsiteDirectory,
    private readonly catalog: WebsiteCatalog,
    private readonly hours: OpeningHoursRepository,
    private readonly closures: BranchClosuresRepository,
    private readonly clock: Clock,
  ) {}

  async read(grants: GrantSet, scope: Scope): Promise<WebsiteOverview> {
    const [content, all, servicesOnWebsite, publicTeam] = await Promise.all([
      this.content.read(),
      this.directory.branchesForWebsite(),
      this.catalog.countOnWebsite(),
      this.directory.countPublicProfiles(),
    ]);
    const branches = all.filter((branch) => reaches(scope, branch.id));
    const ids = branches.map((branch) => branch.id);
    const configured =
      ids.length === 0 ? new Set<string>() : await this.hours.configuredBranchIds(ids);
    const next =
      ids.length === 0
        ? new Map<string, ClosureRow>()
        : await this.closures.nextOf(ids, todayMmt(this.clock.now()));
    const company = grants.isCompany('website.update');
    return {
      site_origin: content.site_origin,
      content,
      branches: branches.map((branch) => {
        const closure = next.get(branch.id);
        return {
          id: branch.id,
          code: branch.code,
          name_mm: branch.name_mm,
          name_en: branch.name_en,
          is_public: branch.is_public,
          map_url: branch.map_url,
          hours_configured: configured.has(branch.id),
          next_closure:
            closure === undefined
              ? null
              : {
                  start_date: closure.start_date,
                  end_date: closure.end_date,
                  notice_mm: closure.notice_mm,
                  notice_en: closure.notice_en,
                },
          editable: grants.covers('website.update', branch.id),
        };
      }),
      counts: {
        public_branches: all.filter((branch) => branch.is_public).length,
        services_on_website: servicesOnWebsite,
        public_team: publicTeam,
      },
      actions: { can_edit_content: company, can_revalidate: company },
    };
  }
}
