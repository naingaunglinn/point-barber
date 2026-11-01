import { LocationType, PriceSource } from '@point/shared';

// The resolution order of the one price store (P2-RULE-03 · D-SVC-03 / 05 / 06 / 08), as a pure rule
// over the non-archived price rows of one branch and service: the rows effective on the date for the
// variant; at BRANCH the barber's own row wins over the branch row; at HOME the HOME row, else the
// branch-level BRANCH row — a barber row never applies at home. No row = not sold.

export interface PriceRow {
  readonly id: string;
  readonly service_variant_id: string | null;
  readonly location_type: number;
  readonly employee_id: string | null;
  readonly price_amount: bigint;
  readonly duration_minutes: number | null;
  /** Myanmar calendar dates, both ends inclusive; null = open. */
  readonly effective_from: string;
  readonly effective_to: string | null;
}

export interface ResolvedPrice {
  readonly row: PriceRow;
  readonly source: PriceSource;
}

export interface PriceKey {
  readonly date: string;
  readonly location: number;
  readonly employeeId: string | null;
  readonly variantId: string | null;
}

export function resolvePrice(rows: readonly PriceRow[], key: PriceKey): ResolvedPrice | null {
  const effective = rows.filter(
    (row) =>
      row.service_variant_id === key.variantId &&
      row.effective_from <= key.date &&
      (row.effective_to === null || key.date <= row.effective_to),
  );
  const branchRow = effective.find(
    (row) => row.location_type === LocationType.BRANCH && row.employee_id === null,
  );
  if (key.location === LocationType.HOME) {
    const home = effective.find(
      (row) => row.location_type === LocationType.HOME && row.employee_id === null,
    );
    if (home !== undefined) return { row: home, source: PriceSource.HOME };
    return branchRow === undefined
      ? null
      : { row: branchRow, source: PriceSource.HOME_FALLBACK_BRANCH };
  }
  const own =
    key.employeeId === null
      ? undefined
      : effective.find(
          (row) => row.location_type === LocationType.BRANCH && row.employee_id === key.employeeId,
        );
  if (own !== undefined) return { row: own, source: PriceSource.BARBER_OVERRIDE };
  return branchRow === undefined ? null : { row: branchRow, source: PriceSource.BRANCH };
}
