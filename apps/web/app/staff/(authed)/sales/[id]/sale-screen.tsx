'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Locale } from '@point/i18n';
import { SaleStatus, VisitStatus, localized } from '@point/shared';
import { ErrorState, Skeleton } from '@point/ui';

import { StaffOfflineBanner } from '../../../../../components/pos/OfflineHelp';
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
// state with a link Home. The sticky visit header stays on every step. The page title names the step
// shown (WCAG 2.4.2 · AD-A11Y-01 — task 13.8): In progress, Checkout, Sale finished, or the sale's
// status Cancelled; one <title>, so a step change rewrites it in place. Each step also has one <h1> with
// that title (AD-A11Y-01): the success panel shows its own (AD-POS-12); the layouts of the others have no
// visible title (AD-POS-04 · AD-POS-07), so theirs is for screen readers only.
export function SaleScreen({ id }: { readonly id: string }) {
  const t = useTranslations();
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
  const panelHasHeading = current.status === SaleStatus.FINISHED && justFinished;
  const step =
    current.status === SaleStatus.CANCELLED
      ? {
          title: t('status.sales.CANCELLED'),
          content: <Cancelled sale={current} visit={visit.data} />,
        }
      : current.status === SaleStatus.FINISHED
        ? {
            title: t('pos.success.title'),
            content: <Finished sale={current} justFinished={justFinished} />,
          }
        : visit.data?.status === VisitStatus.COMPLETED
          ? {
              title: t('pos.checkout.title'),
              content: (
                <Checkout
                  sale={current}
                  visit={visit.data}
                  onFinished={() => setJustFinished(true)}
                />
              ),
            }
          : visit.data !== undefined
            ? {
                title: t('today.inProgress'),
                content: <InProgress sale={current} visit={visit.data} />,
              }
            : null;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="sale-screen">
      {step !== null && <title>{step.title}</title>}
      {step !== null && !panelHasHeading && <h1 className="sr-only">{step.title}</h1>}
      <StaffOfflineBanner />
      {visit.data !== undefined && <VisitHeader visit={visit.data} branchName={branchName} />}
      {step?.content}
    </div>
  );
}
