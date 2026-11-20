import { Injectable } from '@nestjs/common';
import { ErrorCode, type ServiceDto, ServiceStatus, todayMmt } from '@point/shared';

import { type ReadScope, inReadScope } from '../../../common/access/read-scope.js';
import { Clock } from '../../../common/clock/clock.js';
import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import { isUuid } from '../../../common/http/uuid-v7.js';
import { ServiceListRepository } from '../repositories/service-list.repository.js';
import { toListItem } from '../service-list/service-catalog.js';

// One service as P2.SVC.03 returns it (add-service-catalogue design D1 / D5 · Recorded readings 3 and 8): the
// list item plus the descriptions, the website fields, the image and the `branch_services` rows — sold or
// not — at the branches of the caller's read scope. `options` is empty until add-option-services (#13).

/** What the route learned about the caller before it asks for the row. */
export interface ServiceViewer {
  /** The caller's read scope (a branch assignment or a grant). */
  readonly scope: ReadScope;
  /** The caller holds `service.view⁺`: an archived service is returned to them only (P2-RULE-11). */
  readonly management: boolean;
}

/** `/api/v1/public/media/<attachment_id>/original` (P8-RULE-04). */
const imageUrl = (attachmentId: string): string => `/api/v1/public/media/${attachmentId}/original`;

@Injectable()
export class ServiceDetail {
  constructor(
    private readonly repository: ServiceListRepository,
    private readonly clock: Clock,
  ) {}

  /** 404 `not_found` for an id that names no service, and for an archived one the caller may not see. */
  async get(db: Tx, id: string, viewer: ServiceViewer): Promise<ServiceDto> {
    const row = isUuid(id)
      ? await this.repository.service(db, id, todayMmt(this.clock.now()))
      : null;
    if (row === null || (row.archived_at !== null && !viewer.management)) {
      throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    }
    return {
      ...toListItem(row, viewer.scope),
      description_mm: row.description_mm,
      description_en: row.description_en,
      public_description_mm: row.public_description_mm,
      public_description_en: row.public_description_en,
      image_attachment_id: row.image_attachment_id,
      image_url: row.image_attachment_id === null ? null : imageUrl(row.image_attachment_id),
      branches: row.branch_services
        .filter((branch) => inReadScope(viewer.scope, branch.branch_id))
        .map((branch) => ({
          branch_id: branch.branch_id,
          sold: branch.status === ServiceStatus.ACTIVE,
          duration_minutes: branch.duration_minutes,
        })),
      options: { groups: [], variants: [] },
    };
  }
}
