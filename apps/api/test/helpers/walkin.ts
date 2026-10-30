import { randomUUID } from 'node:crypto';

import { FIXTURE_IDS } from '@point/shared/testing';

import { RequestContext } from '../../src/common/http/request-context.js';
import type { ActionRights, SaleViewer } from '../../src/modules/sales/index.js';

// add-walkin-visit-checkout — the fixture people as the services see them until the access guards
// exist (auth PR 2): the actor, the codes their seed role gives at their branch (spec-fixtures §2,
// fixture module 090) and their read scope. `as()` runs a call in a request context, so the audit
// writer and the transaction locals know the actor.

const { users, employees, branches } = FIXTURE_IDS;

const NONE: ActionRights = {
  visit_update: false,
  visit_delete: false,
  sale_finish_override: false,
};
const MANAGER: ActionRights = {
  visit_update: true,
  visit_delete: true,
  sale_finish_override: true,
};

export interface FixturePerson {
  readonly viewer: SaleViewer;
  readonly scope: 'all' | readonly string[];
}

const person = (
  code: 'E001' | 'E002' | 'E003' | 'E004' | 'E005' | 'E006',
  rights: ActionRights,
  scope: 'all' | readonly string[],
): FixturePerson => ({
  viewer: {
    actor: { user_id: users[code], employee_id: employees[code] },
    rightsAt: (branchId) => (scope === 'all' || scope.includes(branchId) ? rights : NONE),
  },
  scope,
});

export const KO_AUNG = person('E004', NONE, [branches.B3]);
export const KO_MIN = person('E005', NONE, [branches.B3]);
export const KO_HTET = person('E006', NONE, [branches.B1]);
export const MA_HNIN = person('E002', MANAGER, [branches.B3]);
export const KO_ZAW = person('E003', MANAGER, [branches.B1]);
export const U_KYAW_ZIN = person('E001', MANAGER, 'all');

/** Runs `work` as the person, in a request context of its own. */
export function as<T>(who: FixturePerson, work: () => Promise<T>): Promise<T> {
  return RequestContext.run(
    {
      request_id: randomUUID(),
      user_id: who.viewer.actor.user_id,
      employee_id: who.viewer.actor.employee_id,
    },
    work,
  );
}
