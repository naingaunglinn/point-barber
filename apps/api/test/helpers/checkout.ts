import { randomUUID } from 'node:crypto';

import { finishRequestSchema, paymentCreateSchema } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';

import { Visits } from '../../src/modules/delivery/index.js';
import { Payments, SalesFinish } from '../../src/modules/sales/index.js';
import type { TestApp } from './test-app.js';
import { type FixturePerson, KO_HTET, as } from './walkin.js';

// add-walkin-visit-checkout — the walk-in steps as one fixture person takes them, for the FINISH tests:
// START (with services), a payment, COMPLETE, FINISH. Each runs in its own request context.

export function checkout(app: TestApp['app']) {
  const visits = app.get(Visits);
  const payments = app.get(Payments);
  const finisher = app.get(SalesFinish);
  const branchOf = (who: FixturePerson) =>
    who === KO_HTET ? FIXTURE_IDS.branches.B1 : FIXTURE_IDS.branches.B3;
  return {
    start: async (who: FixturePerson, items: string[]) => {
      const { visit } = await as(who, () =>
        visits.start(
          who.viewer,
          who.scope,
          { branch_id: branchOf(who), items: items.map((service_id) => ({ service_id })) },
          randomUUID(),
        ),
      );
      return { saleId: visit.sale.id, visitId: visit.id };
    },
    pay: (who: FixturePerson, saleId: string, body: Record<string, unknown>) =>
      as(who, () =>
        payments.add(who.viewer, saleId, paymentCreateSchema.parse(body), randomUUID()),
      ),
    complete: (who: FixturePerson, visitId: string) =>
      as(who, () => visits.complete(who.viewer, visitId)),
    finish: (who: FixturePerson, saleId: string, body: Record<string, unknown>) =>
      as(who, () => finisher.finish(who.viewer, saleId, finishRequestSchema.parse(body))),
  };
}
