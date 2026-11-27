import { Injectable } from '@nestjs/common';
import type { BranchClosure, ClosureListQuery, CursorPage } from '@point/shared';
import { todayMmt } from '@point/shared';

import type { Scope } from '../../../common/access/grant-set.js';
import { Clock } from '../../../common/clock/clock.js';
import { decodeCursor, encodeCursor } from '../../../common/http/cursor.js';
import { BranchClosuresRepository } from '../repositories/branch-closures.repository.js';
import { ClosureViews } from './closure-view.js';

// P8.WEB.05 — the closures of the branches of the caller's `website.*` grant (API-PERM-03: a branch
// outside it gives an empty list, never 403): by default the non-archived ones that have not ended;
// `from` / `to` select the ones overlapping `[from, to]`; `include_archived` adds the archived ones;
// ordered by `start_date` then branch code, with a cursor (proposal reading 7 · design D6).

@Injectable()
export class ClosureReads {
  constructor(
    private readonly repository: BranchClosuresRepository,
    private readonly views: ClosureViews,
    private readonly clock: Clock,
  ) {}

  async list(query: ClosureListQuery, scope: Scope): Promise<CursorPage<BranchClosure>> {
    const today = todayMmt(this.clock.now());
    const bounded = query.from !== undefined || query.to !== undefined;
    const rows = await this.repository.list({
      branches: { all: scope.all, ids: [...scope.branchIds] },
      ...(query.branch_id === undefined ? {} : { branch_id: query.branch_id }),
      // The default list starts today: a closure that has not ended overlaps `[today, ∞)`.
      ...(bounded
        ? {
            ...(query.from === undefined ? {} : { from: query.from }),
            ...(query.to === undefined ? {} : { to: query.to }),
          }
        : { from: today }),
      include_archived: query.include_archived,
      ...(query.cursor === undefined ? {} : { after: decodeCursor(query.cursor) }),
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.views.of(page, today),
      next_cursor: rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null,
      total: null,
    };
  }
}
