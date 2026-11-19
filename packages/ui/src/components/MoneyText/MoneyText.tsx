'use client';

import { formatMoney, type Mmk, type MoneyProfile } from '@point/shared';

import { useFormat } from '../../providers/format';

// Money on screen (D-PLT-04 · AD-FMT-01 · FE-FMT-01 · design D10): only `Mmk`, only through
// `formatMoney`, in tabular figures. `unit={false}` in a table cell whose header carries the unit.
export interface MoneyTextProps {
  readonly amount: Mmk;
  readonly unit?: boolean;
  /** Default: the profile of the `FormatProvider`. */
  readonly profile?: MoneyProfile;
}

export function MoneyText({ amount, unit = true, profile }: MoneyTextProps) {
  const format = useFormat('MoneyText');
  return (
    <span className="font-numeric whitespace-nowrap">
      {formatMoney(amount, { locale: format.locale, profile: profile ?? format.profile, unit })}
    </span>
  );
}
