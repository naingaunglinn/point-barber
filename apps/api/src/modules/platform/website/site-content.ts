import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { DomainEvents } from '../../../common/events/domain-events.js';
import { Jobs } from '../jobs/jobs.service.js';

// The website refresh (API-PUB-03 · ADR-006 action item 3 · ADR-002 · add-company-profile design D6):
// the one function every writer of website data calls, inside its write transaction. It raises the
// domain event `site.content_changed { tags }` and queues the job `site.revalidate { tags }` — so a
// rolled-back write leaves neither. The job's handler (Part 8) arrives with add-public-website-pages;
// until then the jobs wait in their queue, which is harmless: revalidation is idempotent.

/** The cache tags of the public site (API-PUB-03 · ADR-006); `branch:<code>` as in `/book?branch=`. */
export type SiteTag = 'site' | 'home' | 'barbers' | 'services' | `branch:${string}`;

export const SITE_CONTENT_CHANGED = 'site.content_changed';
export const SITE_REVALIDATE = 'site.revalidate';

const FIXED_TAGS = new Set<string>(['site', 'home', 'barbers', 'services']);
/** The branch code pattern of API Part 1 §13 #4. */
const BRANCH_TAG = /^branch:[A-Z0-9]{1,10}$/;

@Injectable()
export class SiteContent {
  constructor(
    private readonly jobs: Jobs,
    private readonly events: DomainEvents,
  ) {}

  /** Website data changed in `tx`: one event and one `site.revalidate` job for `tags`. */
  async touch(tx: Tx, tags: readonly SiteTag[]): Promise<void> {
    const unknown = tags.filter((tag) => !FIXED_TAGS.has(tag) && !BRANCH_TAG.test(tag));
    if (tags.length === 0 || unknown.length > 0) {
      // A programming error: the throw rolls the write back.
      throw new Error(`SiteContent.touch: no tags or unknown tags (${unknown.join(', ')})`);
    }
    const data = { tags: [...tags] };
    this.events.collect({ name: SITE_CONTENT_CHANGED, payload: data });
    await this.jobs.send(tx, SITE_REVALIDATE, data);
  }
}
