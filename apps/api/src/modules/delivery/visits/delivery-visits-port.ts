import { Injectable } from '@nestjs/common';
import { ErrorCode } from '@point/shared';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { ProblemException } from '../../../common/http/problem.exception.js';
import type { VisitForSale, VisitsPort } from '../../sales/index.js';
import { VisitsRepository } from '../repositories/visits.repository.js';
import { visitForSale } from './visit-view.js';

// The VisitsPort of sales, implemented by delivery (design D1) and registered at start-up.
@Injectable()
export class DeliveryVisitsPort implements VisitsPort {
  constructor(private readonly visits: VisitsRepository) {}

  async read(db: Tx, visitId: string): Promise<VisitForSale | null> {
    const visit = await this.visits.find(db, visitId);
    return visit === null ? null : visitForSale(visit);
  }

  async lockForUpdate(tx: Tx, visitId: string): Promise<VisitForSale> {
    const visit = await this.visits.lockForUpdate(tx, visitId);
    if (visit === null) throw new ProblemException(ErrorCode.NOT_FOUND, 404);
    return visitForSale(visit);
  }

  markFinished(tx: Tx, visitId: string, finishedAt: Date, recordedAt: Date): Promise<void> {
    return this.visits.markFinished(tx, visitId, finishedAt, recordedAt);
  }
}
