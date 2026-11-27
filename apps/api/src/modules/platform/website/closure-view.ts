import { Injectable } from '@nestjs/common';
import { type BranchClosure, toMmtIsoMillis } from '@point/shared';

import type { ClosureRow } from '../repositories/branch-closures.repository.js';
import { closureState } from './closure-rules.js';
import { WebsitePeople } from './website-people.js';

// A stored closure as `BranchClosure` (Part 8 §18): its state computed for today, the creator by name.
@Injectable()
export class ClosureViews {
  constructor(private readonly people: WebsitePeople) {}

  async of(rows: readonly ClosureRow[], today: string): Promise<BranchClosure[]> {
    const names = await this.people.userDisplayNames(rows.map((row) => row.created_by_user_id));
    return rows.map((row) => ({
      id: row.id,
      branch_id: row.branch_id,
      start_date: row.start_date,
      end_date: row.end_date,
      notice_mm: row.notice_mm,
      notice_en: row.notice_en,
      state: closureState(row, today),
      created_by: {
        user_id: row.created_by_user_id,
        display_name: names.get(row.created_by_user_id) ?? '',
      },
      created_at: toMmtIsoMillis(row.created_at),
      updated_at: toMmtIsoMillis(row.updated_at),
      archived_at: row.archived_at === null ? null : toMmtIsoMillis(row.archived_at),
    }));
  }
}
