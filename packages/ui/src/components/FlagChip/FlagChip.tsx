'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';

import { FLAGS, type FlagKey } from '../../status/status-map';
import { TONE_CLASS, ToneIcons } from '../../status/tone';

// A flag that marks an exception (AD-CMP-06 · AD-CMP-05 · AD-A11Y-03 · design D8): tone and icon from
// the status map, the label from `status.flag.<key>`; the recorded-by flag takes the recorder's `name`,
// the short / over / reopened flags a `count`. Icon and text always together.

export interface FlagChipProps {
  readonly flag: FlagKey;
  /** The recorder's name for `proxy_recorded`. */
  readonly name?: string;
  /** N for `transfer_short`, `transfer_over` and `reopened`. */
  readonly count?: number;
}

export function FlagChip({ flag, name, count }: FlagChipProps) {
  const t = useTranslations('status.flag');
  const style = FLAGS[flag];
  const label = (t as unknown as (key: string, values: Record<string, string | number>) => string)(
    flag,
    {
      name: name ?? '',
      n: count ?? 0,
    },
  );
  return (
    <span
      data-slot="flag-chip"
      data-tone={style.tone}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        TONE_CLASS[style.tone],
      )}
    >
      <ToneIcons names={[style.icon]} />
      <span>{label}</span>
    </span>
  );
}
