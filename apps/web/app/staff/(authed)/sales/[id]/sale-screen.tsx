'use client';

import { useLocale } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@point/i18n';
import { SaleStatus, VisitStatus, localized } from '@point/shared';
import { ErrorState, OfflineBanner, Skeleton } from '@point/ui';

import { VisitHeader } from '../../../../../components/pos/VisitHeader';
import { screenProblem } from '../../../../../lib/pos/problem';
import { useSale, useVisit } from '../../../../../lib/pos/queries';
import { MainQueryState } from '../../../../../lib/session/main-query-state';
import { useMe } from '../../../../../lib/session/use-me';
import { Checkout } from './checkout';
import { Cancelled, Finished } from './done';
import { InProgress } from './in-progress';

// /sales/[id] — one screen by state (AD-POS-04 · AD-STATE-04 · add-walkin-visit-checkout task 11.1): the
// visit STARTED → in progress; COMPLETED → checkout; the sale FINISHED → success right after FINISH, the
// read-only receipt when opened again; CANCELLED → read-only. A refused read (403, 404) shows the page
// state with a link Home. The sticky visit header stays on every step.
export function SaleScreen({ id }: { readonly id: string }) {
  const locale = useLocale() as Locale;
  const me = useMe().data;
  const sale = useSale(id);
  const visit = useVisit(sale.data?.visit_id);
  const [justFinished, setJustFinished] = useState(false);

  // A refused read (403 / 404) is the page state; any other failure is the error state with Retry.
  const failed = sale.isError ? sale : visit.isError ? visit : null;
  if (failed !== null) {
    return (
      <MainQueryState error={failed.error}>
        <div>
          <ErrorState problem={screenProblem(failed.error)} onRetry={() => failed.refetch()} />
        </div>
      </MainQueryState>
    );
  }
  if (sale.data === undefined || (sale.data.visit_id !== null && visit.data === undefined)) {
    return (
      <div aria-busy="true">
        <Skeleton shape="text" />
      </div>
    );
  }
  const current = sale.data;
  const branch = me?.branches_in_scope.find((item) => item.id === current.branch_id);
  const branchName = branch === undefined ? '' : localized(branch, 'name', locale);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="sale-screen">
      <OfflineBanner helpHref="/help/offline" />
      {visit.data !== undefined && <VisitHeader visit={visit.data} branchName={branchName} />}
      {current.status === SaleStatus.CANCELLED ? (
        <Cancelled sale={current} visit={visit.data} />
      ) : current.status === SaleStatus.FINISHED ? (
        <Finished sale={current} justFinished={justFinished} />
      ) : visit.data?.status === VisitStatus.COMPLETED ? (
        <Checkout sale={current} visit={visit.data} onFinished={() => setJustFinished(true)} />
      ) : visit.data !== undefined ? (
        <InProgress sale={current} visit={visit.data} />
      ) : null}
    </div>
  );
}
