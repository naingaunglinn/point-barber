import { type SaleActionsDto, SaleStatus, VisitStatus } from '@point/shared';

// Sale.actions — what the caller may do now (AD-PERM-02 · P4-RULE-03 · add-walkin-visit-checkout design
// D2 · add-proxy-recording design D4), from the sale's state and the caller's rights; the API still
// decides on every write. Checkout actors are the performer and the recorder of a reason-1 visit (that
// visit only); lines are the performer and the recorder; a code holder acts through visit.update,
// visit.delete or sale.finish_override covering the branch, and finishing that way needs a reason. The
// flags of features this change does not build are false.

export interface ActionRights {
  readonly visit_update: boolean;
  readonly visit_delete: boolean;
  readonly sale_finish_override: boolean;
}

export interface ActionFacts {
  readonly sale_status: number;
  /** null for a sale without a visit (not built in this change). */
  readonly visit_status: number | null;
  readonly is_performer: boolean;
  readonly is_recorder: boolean;
  /** The recorder of a visit with `proxy_reason` 1 (D-VIS-06): takes payment, finishes, marks incomplete. */
  readonly is_phone_unavailable_recorder: boolean;
}

export function saleActions(facts: ActionFacts, rights: ActionRights): SaleActionsDto {
  const open = facts.sale_status === SaleStatus.OPEN;
  const visitOpen =
    facts.visit_status === VisitStatus.STARTED || facts.visit_status === VisitStatus.COMPLETED;
  const lineActor = facts.is_performer || facts.is_recorder;
  const checkoutActor = facts.is_performer || facts.is_phone_unavailable_recorder;
  const checkout = checkoutActor || rights.sale_finish_override;
  const finish = open && facts.visit_status === VisitStatus.COMPLETED && checkout;
  return {
    edit_lines: open && visitOpen && (lineActor || rights.visit_update),
    take_payment: open && checkout,
    finish,
    finish_needs_reason: finish && !checkoutActor,
    mark_incomplete: open && visitOpen && (checkoutActor || rights.visit_delete),
    override_price: false,
    request_discount: false,
    refund: false,
    adjust: false,
  };
}
