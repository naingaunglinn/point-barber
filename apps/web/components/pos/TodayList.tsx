'use client';

import { type VisitDto, VisitStatus, formatDuration, localized } from '@point/shared';
import {
  CardList,
  EmptyState,
  ErrorState,
  type ErrorProblem,
  StatusBadge,
  useNow,
} from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';

import { minutesSince } from './minutes';

// "In progress" on Today (AD-TODAY-01 · AD-TODAY-02 · AD-CMP-05 · AD-STATE-01..03 · add-walkin-visit-checkout
// tasks 10.3 / 10.4): my open visits, oldest first, each a card — the customer or "Walk-in", the services,
// the status (a COMPLETED visit reads "Awaiting payment" in the warning tone) with the minutes since START,
// and the next action ("Service done" / "Take payment"), which opens the sale. While loading: skeleton
// cards; nothing open: the empty state with ＋ Start; a failed query: the error state with Retry.

export interface TodayListProps {
  /** `GET /v1/me/visits` — open visits; undefined while it loads. */
  readonly visits: readonly VisitDto[] | undefined;
  readonly error?: ErrorProblem | null;
  readonly onRetry?: () => void | Promise<unknown>;
  readonly onOpen: (visit: VisitDto) => void;
  readonly onStart: () => void;
}

export function TodayList({ visits, error, onRetry, onOpen, onStart }: TodayListProps) {
  const t = useTranslations('today');
  const tStart = useTranslations('pos.start');
  const locale = useLocale() as 'my' | 'en';
  const now = useNow();

  if (error) return <ErrorState problem={error} onRetry={onRetry} />;
  const open = (visits ?? [])
    .filter(
      (visit) => visit.status === VisitStatus.STARTED || visit.status === VisitStatus.COMPLETED,
    )
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  if (visits !== undefined && open.length === 0) {
    return (
      <EmptyState
        title={t('empty.title')}
        body={t('empty.body')}
        action={{ label: tStart('submit'), onPress: onStart }}
      />
    );
  }
  return (
    <section className="grid gap-3" aria-labelledby="today-in-progress">
      <h2 id="today-in-progress" className="text-lg font-semibold">
        {t('inProgress')}
      </h2>
      <CardList
        rows={open}
        loading={visits === undefined}
        rowKey={(visit) => visit.id}
        onRowPress={onOpen}
        card={(visit) => ({
          fields: [
            visit.sale.customer?.name ?? t('walkIn'),
            visit.sale.items
              .filter((item) => item.removed_at === null)
              .map((item) => localized(item, 'description', locale))
              .join(', '),
            <span key="status" className="flex items-center gap-2">
              <StatusBadge table="visits" code={visit.status} />
              <span>{formatDuration(minutesSince(visit.started_at, now), { locale })}</span>
            </span>,
          ],
          action: {
            label:
              visit.status === VisitStatus.COMPLETED
                ? t('next.takePayment')
                : t('next.serviceDone'),
            onPress: () => onOpen(visit),
          },
        })}
      />
    </section>
  );
}
