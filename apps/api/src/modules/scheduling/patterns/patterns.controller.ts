import { Controller, Get, Param, Put } from '@nestjs/common';
import {
  type PatternQuery,
  type PatternSet,
  type PatternSetWrite,
  businessDateOf,
  patternQuerySchema,
  patternSetWriteSchema,
} from '@point/shared';

import { Can, CanView } from '../../../common/access/declarations.js';
import { Clock } from '../../../common/clock/clock.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { RequestContext } from '../../../common/http/request-context.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited } from '../../platform/index.js';
import { callerGrants } from './caller-grants.js';
import { PatternSets } from './pattern-sets.js';
import { SCHEDULE_PATTERN_SET, type PatternSaved, PatternWriter } from './pattern-writer.js';

// P2.PAT.01 / P2.PAT.02 (design D2 — one access declaration each, API-PERM-02):
// - GET: the employee themself with no code, or `schedule.view⁺` through a grant whose scope overlaps
//   the employee's branches (P1-RULE-11 target set: no overlap → 404; no schedule code → 403 with
//   `context.required` = `schedule.view`).
// - PUT: `schedule.update` somewhere in the employee's target set; the handler then requires every
//   branch of the old ∪ new segments (design D3 step 4). CSRF header; no Idempotency-Key — an identical
//   repeat is a no-op (D3 step 7).

@Controller('v1/employees/:id/schedule-pattern')
export class PatternsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sets: PatternSets,
    private readonly writer: PatternWriter,
  ) {}

  /** P2.PAT.01 — the set effective on `as_of` (default today, MMT), with `history` on request. */
  @Get()
  @CanView('schedule', { target: 'employee:id', orSelf: 'params.id' })
  async read(
    @Param('id') id: string,
    @ZQuery(patternQuerySchema) query: PatternQuery,
  ): Promise<PatternSet> {
    const asOf = query.as_of ?? businessDateOf(this.clock.now());
    const set = await this.sets.effectiveOn(this.prisma, id, asOf);
    if (!query.include_history) return set;
    return { ...set, history: await this.sets.history(this.prisma, id) };
  }

  /** P2.PAT.02 — save the set from `effective_from`; 200 with the set and `warnings[]`. */
  @Put()
  @Can('schedule.update', { target: 'employee:id' })
  @Audited({ actions: [SCHEDULE_PATTERN_SET], target: 'employee' })
  save(
    @Param('id') id: string,
    @ZBody(patternSetWriteSchema) body: PatternSetWrite,
  ): Promise<PatternSaved> {
    return this.writer.save(id, body, callerGrants(), RequestContext.current()?.employee_id);
  }
}
