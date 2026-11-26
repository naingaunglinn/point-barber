import { describe, expect, it } from 'vitest';

import type { TransactionRunner, Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import type { Audit } from '../audit/audit.service.js';
import type { SiteContent, SiteTag } from './site-content.js';
import type { WebsiteDirectory } from './website-ports.js';
import { WebsiteRevalidate } from './website-revalidate.js';

// add-website-management task 5.6 — P8.WEB.12 (design D12): the tags are checked before anything is
// queued; `SiteContent.touch` throws on an unknown tag, so a bad tag must never reach it.
function revalidate() {
  const touched: (readonly SiteTag[])[] = [];
  const audited: unknown[] = [];
  const service = new WebsiteRevalidate(
    { run: (work: (tx: Tx) => Promise<unknown>) => work({} as Tx) } as unknown as TransactionRunner,
    {
      branchesForWebsite: () => Promise.resolve([{ code: 'B1' }, { code: 'B3' }]),
    } as unknown as WebsiteDirectory,
    {
      touch: (_tx: Tx, tags: readonly SiteTag[]) => {
        touched.push(tags);
        return Promise.resolve();
      },
    } as unknown as SiteContent,
    { emit: (event: unknown) => Promise.resolve(void audited.push(event)) } as unknown as Audit,
  );
  return { service, touched, audited };
}

describe('add-website-management · WebsiteRevalidate (task 5.6)', () => {
  it('without tags: the four fixed tags and every ACTIVE branch, one job, one audit row', async () => {
    const { service, touched, audited } = revalidate();
    const result = await service.run({});
    expect(result.queued_tags).toStrictEqual([
      'site',
      'home',
      'barbers',
      'services',
      'branch:B1',
      'branch:B3',
    ]);
    expect(touched).toStrictEqual([result.queued_tags]);
    expect(audited).toMatchObject([
      { action: 'website.revalidate', branch_id: null, after: { tags: result.queued_tags } },
    ]);
  });

  it('the tags sent, once each, in the order sent', async () => {
    const { service, touched } = revalidate();
    expect((await service.run({ tags: ['home', 'branch:B3', 'home'] })).queued_tags).toStrictEqual([
      'home',
      'branch:B3',
    ]);
    expect(touched).toHaveLength(1);
  });

  it.each([[['branch:B9']], [['site', 'sitemap']], [['']], [[]]])(
    'refuses %j with 400 validation and queues nothing',
    async (tags) => {
      const { service, touched, audited } = revalidate();
      await expect(service.run({ tags })).rejects.toBeInstanceOf(ProblemException);
      await service.run({ tags }).catch((error: unknown) => {
        expect(error).toMatchObject({ code: 'validation', status: 400 });
      });
      expect([touched, audited]).toStrictEqual([[], []]);
    },
  );
});
