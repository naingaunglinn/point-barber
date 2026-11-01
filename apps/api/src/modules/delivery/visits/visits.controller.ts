import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  ErrorCode,
  type MyVisitsQuery,
  type ReasonBody,
  type RequestLookupDto,
  type StartVisitRequest,
  type VisitDto,
  myVisitsQuerySchema,
  reasonBodySchema,
  startVisitRequestSchema,
} from '@point/shared';

import { AccessContext } from '../../../common/access/access-context.js';
import { Can, CanView, Self, Staff } from '../../../common/access/declarations.js';
import { toReadScope } from '../../../common/access/read-scope.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { ZBody, ZQuery } from '../../../common/http/zod-validation.pipe.js';
import { Audited, IdempotencyKey, Idempotent } from '../../platform/index.js';
import { SaleViewers } from '../../sales/index.js';
import { VISIT_COMPLETE, VISIT_INCOMPLETE, VISIT_START, Visits } from './visits.js';

// The visit endpoints of the walk-in (P4.VIS.02 – .06 · P4.REQ.01 · add-walkin-visit-checkout design
// D2): one access declaration each; the entity routes find the visit's branch through VisitAccess.
@Controller('v1')
export class VisitsController {
  constructor(
    private readonly visits: Visits,
    private readonly viewers: SaleViewers,
  ) {}

  /** P4.VIS.02 — the caller's own visits (performer or recorder), never another person's. */
  @Get('me/visits')
  @Self()
  async mine(@ZQuery(myVisitsQuerySchema) query: MyVisitsQuery): Promise<{ items: VisitDto[] }> {
    return this.visits.mine(await this.viewers.current(), {
      ...(query.status === undefined ? {} : { statuses: query.status }),
      ...(query.date === undefined ? {} : { date: query.date }),
    });
  }

  /** P4.VIS.03 START (walk-in) — 201 Visit; a replay of the key answers 200 (API-IDEM-01). */
  @Post('visits')
  @Staff()
  @Idempotent()
  @Audited({ actions: [VISIT_START] })
  async start(
    @ZBody(startVisitRequestSchema) body: StartVisitRequest,
    @IdempotencyKey() key: string,
  ): Promise<VisitDto> {
    const viewer = await this.viewers.current();
    const scope = toReadScope(AccessContext.scope());
    return (await this.visits.start(viewer, scope, body, key)).visit;
  }

  /** P4.VIS.04 — the visit with its sale: a reader of it (P4-RULE-03), or `visit.view⁺`. */
  @Get('visits/:id')
  @CanView('visit', { branch: 'params.id→entity.branch_id', orSelf: 'sale.readers' })
  async read(@Param('id') id: string): Promise<VisitDto> {
    return this.visits.read(await this.viewers.current(), id);
  }

  /** P4.VIS.05 COMPLETE — a line actor, or `visit.update` at the visit's branch. */
  @Post('visits/:id/complete')
  @HttpCode(200)
  @Can('visit.update', { branch: 'params.id→entity.branch_id', orSelf: 'visit.lineActors' })
  @Audited({ actions: [VISIT_COMPLETE] })
  async complete(@Param('id') id: string): Promise<VisitDto> {
    return this.visits.complete(await this.viewers.current(), id);
  }

  /** P4.VIS.06 INCOMPLETE — the performer, or `visit.delete` at the visit's branch. */
  @Post('visits/:id/incomplete')
  @HttpCode(200)
  @Can('visit.delete', { branch: 'params.id→entity.branch_id', orSelf: 'visit.incompleteActors' })
  @Audited({ actions: [VISIT_INCOMPLETE] })
  async incomplete(
    @Param('id') id: string,
    @ZBody(reasonBodySchema) body: ReasonBody,
  ): Promise<VisitDto> {
    return this.visits.incomplete(await this.viewers.current(), id, body.reason);
  }

  /** P4.REQ.01 — what the caller saved under a key; 404 = not saved, retry with the same key. */
  @Get('me/requests/:client_request_id')
  @Self()
  async request(@Param('client_request_id') key: string): Promise<RequestLookupDto> {
    const { actor } = await this.viewers.current();
    const found = isUuid(key)
      ? await this.visits.lookupRequest(actor.user_id, key.toLowerCase())
      : null;
    if (found === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return found;
  }
}
