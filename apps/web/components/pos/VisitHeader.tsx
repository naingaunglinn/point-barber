'use client';

import { type VisitDto, formatDuration, formatTime } from '@point/shared';
import { EmployeeChip, useNow } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';

import { minutesSince } from './minutes';

// The sticky header of a visit (AD-POS-04 · AD-POS-06 · AD-GOAL-02 · add-walkin-visit-checkout task 11.2):
// the customer or "Walk-in", the performer's chip, the branch, the start time and the minutes since. It
// stays on the in-progress screen and every checkout step, so the barber never loses who and where.

export interface VisitHeaderProps {
  readonly visit: VisitDto;
  readonly branchName: string;
}

export function VisitHeader({ visit, branchName }: VisitHeaderProps) {
  const t = useTranslations('pos.visit');
  const tToday = useTranslations('today');
  const locale = useLocale() as 'my' | 'en';
  const now = useNow();
  return (
    <header
      className="sticky top-0 z-10 grid gap-1 border-b border-border bg-background p-3"
      data-testid="visit-header"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-semibold" data-testid="visit-customer">
          {visit.sale.customer?.name ?? tToday('walkIn')}
        </span>
        <EmployeeChip name={visit.performed_by.display_name} />
      </div>
      <div className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
        <span>{branchName}</span>
        <span data-testid="visit-started">
          {t('started', {
            time: formatTime(visit.started_at, { locale }),
            elapsed: formatDuration(minutesSince(visit.started_at, now), { locale }),
          })}
        </span>
      </div>
    </header>
  );
}
