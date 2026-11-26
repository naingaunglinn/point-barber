import { Injectable } from '@nestjs/common';

import { type LoadedTarget, TargetResolvers, routeKey } from '../../../common/access/resolvers.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { BranchClosuresRepository } from '../repositories/branch-closures.repository.js';

// The closure loader of the access guard (add-website-management design D2 · API-PERM-02 · ADR-012):
// P8.WEB.07 / 08 name `params.id→entity.branch_id`, so the guard asks this loader for the closure's
// branch before it decides; an unknown id is 404 before the access decision, as the branch and visit
// loaders answer. The guard runs before the pipes, so an id that is not a UUID is a missing row.

export const CLOSURE_ROUTES = [
  routeKey('PATCH', '/v1/website/closures/:id'),
  routeKey('POST', '/v1/website/closures/:id/archive'),
];

@Injectable()
export class ClosureAccess {
  constructor(private readonly closures: BranchClosuresRepository) {}

  register(targets: TargetResolvers): void {
    targets.register(CLOSURE_ROUTES, (id) => this.target(id));
  }

  /** The closure's branch, archived or not (an archived closure answers 409 after the decision). */
  async target(id: string): Promise<LoadedTarget | null> {
    if (!isUuid(id)) return null;
    const branchId = await this.closures.branchOf(id);
    return branchId === null ? null : { branch_ids: [branchId] };
  }
}
