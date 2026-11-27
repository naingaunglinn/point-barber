import { Injectable } from '@nestjs/common';
import { ErrorCode, type RevalidateRequestBody } from '@point/shared';

import { TransactionRunner } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { Audit } from '../audit/audit.service.js';
import { SiteContent, type SiteTag } from './site-content.js';
import { WebsiteDirectory } from './website-ports.js';

// P8.WEB.12 — refresh the website by hand (P8-RULE-11 · ADR-006 action item 3 · design D12): one
// `site.revalidate` job through `SiteContent.touch` for the tags sent — each `site`, `home`, `barbers`,
// `services` or `branch:<code>` of a branch — or, without `tags`, the four fixed tags and every ACTIVE
// branch. Every tag is checked before anything is queued (400 `validation`); one audit row with the tags.

export const WEBSITE_REVALIDATE = 'website.revalidate';

const FIXED_TAGS: readonly SiteTag[] = ['site', 'home', 'barbers', 'services'];

@Injectable()
export class WebsiteRevalidate {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly directory: WebsiteDirectory,
    private readonly site: SiteContent,
    private readonly audit: Audit,
  ) {}

  async run(body: RevalidateRequestBody): Promise<{ queued_tags: SiteTag[] }> {
    const branches = await this.directory.branchesForWebsite();
    const known: SiteTag[] = [
      ...FIXED_TAGS,
      ...branches.map((branch): SiteTag => `branch:${branch.code}`),
    ];
    const tags = body.tags === undefined ? known : this.checked(body.tags, known);
    await this.runner.run(async (tx) => {
      await this.site.touch(tx, tags);
      await this.audit.emit({
        action: WEBSITE_REVALIDATE,
        entity_type: 'settings',
        entity_id: null,
        branch_id: null,
        after: { tags },
      });
    });
    return { queued_tags: tags };
  }

  /** Each sent tag as a known one, once, in the order sent; an unknown tag or none at all is a 400. */
  private checked(sent: readonly string[], known: readonly SiteTag[]): SiteTag[] {
    const tags: SiteTag[] = [];
    const errors: { field: string; code: string }[] = [];
    sent.forEach((tag, index) => {
      const match = known.find((candidate) => candidate === tag);
      if (match === undefined) errors.push({ field: `tags[${index}]`, code: 'invalid_value' });
      else if (!tags.includes(match)) tags.push(match);
    });
    if (sent.length === 0) errors.push({ field: 'tags', code: 'invalid_value' });
    if (errors.length > 0) throw new ProblemException(ErrorCode.VALIDATION, 400, { errors });
    return tags;
  }
}
