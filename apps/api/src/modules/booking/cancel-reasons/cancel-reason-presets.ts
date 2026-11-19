import { CancelReasonStatus, CancelReasonSystemCode } from '@point/shared';

// The base seed of the cancel-reason master list (add-booking-cancel-reasons design D3 · task 1.5):
// the four presets of API Part 3 §3 / DB Part 3 F-BK-17 (D-BKG-14 · D-BKG-17 · D-DB-07). The Myanmar
// names are DB Part 3's, the English names Part 3 §3's, `sort_order` 1 … 4 in the listed order
// (proposal reading 7). The planner is pure; CancelReasonSeed inserts what it returns.

/** One row the seed inserts — the members of `booking_cancel_reasons` it sets. */
export interface CancelReasonPreset {
  readonly name_mm: string;
  readonly name_en: string;
  readonly requires_note: boolean;
  readonly system_code: CancelReasonSystemCode | null;
  readonly sort_order: number;
  readonly status: CancelReasonStatus;
}

const preset = (
  name_mm: string,
  name_en: string,
  sort_order: number,
  extra: { requires_note?: boolean; system_code?: CancelReasonSystemCode } = {},
): CancelReasonPreset => ({
  name_mm,
  name_en,
  requires_note: extra.requires_note ?? false,
  system_code: extra.system_code ?? null,
  sort_order,
  status: CancelReasonStatus.ACTIVE,
});

/** The no-show row the timer of add-booking-noshow cancels with (D-BKG-17) — names only may change. */
const NO_SHOW = { name_mm: 'Customer မလာ', name_en: 'Customer no-show' } as const;

export const CANCEL_REASON_PRESETS: readonly CancelReasonPreset[] = [
  preset('Customer ပြောင်းချင်', 'Customer wants to change', 1),
  preset('Barber မအား', 'Barber not available', 2),
  preset(NO_SHOW.name_mm, NO_SHOW.name_en, 3, { system_code: CancelReasonSystemCode.NO_SHOW }),
  preset('Other', 'Other', 4, { requires_note: true }),
];

/** What the planner reads of the company's reasons: two counts and one aggregate, no row list. */
export interface CancelReasonSeedState {
  /** Every row of the company, archived rows included. */
  readonly rows: number;
  /** A `system_code` 1 row exists — an archived one counts, as the unique index counts it. */
  readonly hasNoShow: boolean;
  /** The highest `sort_order` of the non-archived rows; 0 when there is none. */
  readonly lastSortOrder: number;
}

/**
 * The rows to insert for a company (design D3 steps 2 – 3): no row at all → the four presets; rows but
 * no system row → the no-show row only, placed last; otherwise nothing — an existing row is never
 * changed, so a rename survives every start.
 */
export function planCancelReasonSeed(state: CancelReasonSeedState): readonly CancelReasonPreset[] {
  if (state.rows === 0) return CANCEL_REASON_PRESETS;
  if (state.hasNoShow) return [];
  const { name_mm, name_en } = NO_SHOW;
  return [
    preset(name_mm, name_en, state.lastSortOrder + 1, {
      system_code: CancelReasonSystemCode.NO_SHOW,
    }),
  ];
}
