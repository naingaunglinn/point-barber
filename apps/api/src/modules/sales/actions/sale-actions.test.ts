import { SaleStatus, VisitStatus } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { type ActionRights, saleActions } from './sale-actions.js';

// add-walkin-visit-checkout task 6.12 — Sale.actions from the state and the caller's rights
// (AD-PERM-02 · P4-RULE-03 · design D2): the performer needs no code; a code holder acts through
// visit.update / visit.delete / sale.finish_override, and finishing through the override needs a
// reason; a colleague without a code gets nothing. The flags of absent features are always false.
const none: ActionRights = {
  visit_update: false,
  visit_delete: false,
  sale_finish_override: false,
};
const manager: ActionRights = {
  visit_update: true,
  visit_delete: true,
  sale_finish_override: true,
};
const open = (visit: number) => ({ sale_status: SaleStatus.OPEN, visit_status: visit });

const absent = { override_price: false, request_discount: false, refund: false, adjust: false };

describe('saleActions', () => {
  it('the performer of a COMPLETED visit: everything, no reason needed', () => {
    expect(
      saleActions({ ...open(VisitStatus.COMPLETED), is_performer: true, is_recorder: true }, none),
    ).toStrictEqual({
      edit_lines: true,
      take_payment: true,
      finish: true,
      finish_needs_reason: false,
      mark_incomplete: true,
      ...absent,
    });
  });

  it('a STARTED visit: lines and payments, no Finish yet', () => {
    expect(
      saleActions({ ...open(VisitStatus.STARTED), is_performer: true, is_recorder: true }, none),
    ).toMatchObject({ edit_lines: true, take_payment: true, finish: false, mark_incomplete: true });
  });

  it('Ma Hnin with the codes for the branch: Finish through the override needs a reason', () => {
    expect(
      saleActions(
        { ...open(VisitStatus.COMPLETED), is_performer: false, is_recorder: false },
        manager,
      ),
    ).toStrictEqual({
      edit_lines: true,
      take_payment: true,
      finish: true,
      finish_needs_reason: true,
      mark_incomplete: true,
      ...absent,
    });
  });

  it('Ko Min, a colleague without a code: nothing', () => {
    expect(
      saleActions(
        { ...open(VisitStatus.COMPLETED), is_performer: false, is_recorder: false },
        none,
      ),
    ).toStrictEqual({
      edit_lines: false,
      take_payment: false,
      finish: false,
      finish_needs_reason: false,
      mark_incomplete: false,
      ...absent,
    });
  });

  it('the recorder who is not the performer may edit lines only', () => {
    expect(
      saleActions({ ...open(VisitStatus.STARTED), is_performer: false, is_recorder: true }, none),
    ).toMatchObject({ edit_lines: true, take_payment: false, mark_incomplete: false });
  });

  it.each([
    ['FINISHED', SaleStatus.FINISHED, VisitStatus.FINISHED],
    ['CANCELLED', SaleStatus.CANCELLED, VisitStatus.INCOMPLETE],
  ])('a %s sale: no action, whoever asks', (_, sale, visit) => {
    const actions = saleActions(
      { sale_status: sale, visit_status: visit, is_performer: true, is_recorder: true },
      manager,
    );
    expect(Object.values(actions).every((flag) => !flag)).toBe(true);
  });
});
