'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { todayMmt } from '@point/shared';
import { DateText, OfflineBanner, PageHeader, useNow } from '@point/ui';

import { TodayList } from '../../../../components/pos/TodayList';
import { screenProblem } from '../../../../lib/pos/problem';
import { useOpenVisits } from '../../../../lib/pos/queries';

// Today (AD-TODAY-01 / 02 · AD-STATE-01..05 · add-walkin-visit-checkout tasks 10.3 / 10.4): the date as
// `Mon, 05/Oct/2026`, the branch chip in the app bar, ＋ Start as the page's primary action (AD-LAY-05 —
// the way in where the bottom navigation is not shown), and "In progress" — my open visits, oldest
// first. A card's next action opens its sale; ＋ Start opens the arrival step.
export function TodayScreen() {
  const t = useTranslations('today');
  const router = useRouter();
  const now = useNow();
  const visits = useOpenVisits();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="today">
      <OfflineBanner helpHref="/help/offline" />
      <div data-testid="today-header">
        <PageHeader
          title={t('title')}
          subtitle={<DateText value={todayMmt(now)} weekday />}
          primary={{ label: t('nav.start'), onPress: () => router.push('/visits/new') }}
        />
      </div>
      <TodayList
        visits={visits.data}
        error={visits.isError ? screenProblem(visits.error) : null}
        onRetry={() => visits.refetch()}
        onOpen={(visit) => router.push(`/sales/${visit.sale.id}`)}
        onStart={() => router.push('/visits/new')}
      />
    </div>
  );
}
