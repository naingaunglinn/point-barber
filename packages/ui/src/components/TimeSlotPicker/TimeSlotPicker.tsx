'use client';

import { cn } from 'cn';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

import { formatTime, type Instant, type Slot } from '@point/shared';

import { useFormat } from '../../providers/format';
import { Skeleton } from '../Skeleton/Skeleton';

// Bookable start times (AD-BKG-01 · D-PLT-05 · design D10): only the times it is given, in 12-hour form,
// as a radio group; the chosen time is marked by a check icon as well as the fill. "No times left on
// this day" when there is none; a skeleton while they load.

export interface TimeSlotPickerProps {
  readonly slots: readonly Slot[];
  readonly value: Instant | null;
  readonly onChange: (startsAt: Instant) => void;
  readonly loading?: boolean;
  /** Translated name of the group (the day, the barber). */
  readonly 'aria-label'?: string;
}

export function TimeSlotPicker({
  slots,
  value,
  onChange,
  loading = false,
  'aria-label': label,
}: TimeSlotPickerProps) {
  const t = useTranslations('common.slots');
  const { locale } = useFormat('TimeSlotPicker');
  if (loading) return <Skeleton shape="text" count={3} />;
  if (slots.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;
  return (
    <RadioGroupPrimitive.Root
      value={value ?? ''}
      onValueChange={onChange}
      aria-label={label}
      className="flex flex-wrap gap-2"
      data-slot="time-slots"
    >
      {slots.map((slot) => {
        const chosen = slot.starts_at === value;
        return (
          <RadioGroupPrimitive.Item
            key={slot.starts_at}
            value={slot.starts_at}
            className={cn(
              'relative inline-flex min-h-11 items-center gap-1 rounded-md border px-3 font-numeric text-sm',
              chosen
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-muted',
            )}
          >
            {chosen ? <Check aria-hidden className="size-4" data-icon="check" /> : null}
            {formatTime(slot.starts_at, { locale })}
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroupPrimitive.Root>
  );
}
