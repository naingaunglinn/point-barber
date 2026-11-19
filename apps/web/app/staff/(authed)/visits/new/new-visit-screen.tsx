'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { Locale } from '@point/i18n';
import { type RequestLookupDto, type VisitDto, localized } from '@point/shared';

import { ArrivalStep } from '../../../../../components/pos/ArrivalStep';
import { StaffOfflineBanner } from '../../../../../components/pos/OfflineHelp';
import { SavedCheck } from '../../../../../components/pos/SavedCheck';
import { type LateEntryStart, StartSheet } from '../../../../../components/pos/StartSheet';
import { keepLateEntryTimes } from '../../../../../components/pos/late-entry-times';
import { useSavedSubmit } from '../../../../../components/pos/use-saved-submit';
import { api, apiWithMeta } from '../../../../../lib/api/client';
import { type ScreenProblem, screenProblem } from '../../../../../lib/pos/problem';
import { lookupRequest, useServices, useStore } from '../../../../../lib/pos/queries';
import { useAction } from '../../../../../lib/pos/use-action';
import { useBranch } from '../../../../../lib/session/branch';
import { useCan } from '../../../../../lib/session/grants';
import { useMe } from '../../../../../lib/session/use-me';

// ＋ Start → arrival step ("Walk-in") → the START sheet (AD-POS-01 / 02 / 03 · AD-NET-01 / 02 ·
// add-walkin-visit-checkout tasks 10.5 – 10.9). One Idempotency-Key per tap on Start, kept across its
// retries; after 15 s without an answer the key is looked up. The visit opens on the screen of its sale.
// "Open the previous customer" reads the waiting visit like the screen's other requests: one at a time,
// busy while it runs, a failure shown in the sheet.
// The page title is the START sheet's (WCAG 2.4.2 · AD-A11Y-01 — task 13.8).
export function NewVisitScreen() {
  const t = useTranslations('pos.start');
  const router = useRouter();
  const locale = useLocale() as Locale;
  const me = useMe().data;
  const { startBranch } = useBranch();
  const services = useServices(startBranch?.id);
  const store = useStore();
  const [sheet, setSheet] = useState(false);
  const [problem, setProblem] = useState<ScreenProblem | null>(null);
  // Once START is saved the sale screen is opening: Start stays busy until this screen leaves, so a
  // second tap in that gap starts nothing (AD-NET-01 — one tap, one row).
  const [opening, setOpening] = useState(false);
  const chosen = useRef<readonly string[]>([]);
  // add-late-entry (D6): START sends the reason, the note and the start time; the three later times stay
  // on this device for the steps that send them.
  const lateEntry = useRef<LateEntryStart | null>(null);
  const can = useCan();
  const keepTimes = (visitId: string) => {
    const late = lateEntry.current;
    if (late === null) return;
    keepLateEntryTimes(visitId, {
      completed_at: late.completed_at,
      received_at: late.received_at,
      finished_at: late.finished_at,
    });
  };
  // The read of the visit that waits for payment (no sale to reload: nothing is stale here).
  const unpaid = useAction(() => undefined);

  const start = useSavedSubmit<{ data: VisitDto }, RequestLookupDto>({
    send: (key) =>
      apiWithMeta<VisitDto>('/visits', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          branch_id: startBranch?.id,
          items: chosen.current.map((service_id) => ({ service_id })),
          ...(lateEntry.current === null
            ? {}
            : {
                late_entry: {
                  reason: lateEntry.current.reason,
                  ...(lateEntry.current.note === undefined ? {} : { note: lateEntry.current.note }),
                  started_at: lateEntry.current.started_at,
                },
              }),
        },
      }),
    lookup: lookupRequest,
    onSent: ({ data: visit }) => {
      keepTimes(visit.id);
      store.visit(visit);
      setOpening(true);
      router.push(`/sales/${visit.sale.id}`);
    },
    onFound: (found) => {
      if (found.visit_id !== null) keepTimes(found.visit_id);
      if (found.sale_id === null) return;
      setOpening(true);
      router.push(`/sales/${found.sale_id}`);
    },
    onRefused: (error) => setProblem(screenProblem(error)),
  });

  if (me === undefined) return null;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="new-visit">
      <title>{t('title')}</title>
      <StaffOfflineBanner />
      <ArrivalStep
        onWalkIn={() => {
          setProblem(null);
          unpaid.clear();
          setSheet(true);
        }}
      />
      {startBranch !== null && (
        <StartSheet
          open={sheet}
          onOpenChange={setSheet}
          branch={{ id: startBranch.id, name: localized(startBranch, 'name', locale) }}
          performer={{ name: localized(me.employee, 'name', locale) }}
          services={services.data}
          pending={opening || start.state === 'sending' || start.state === 'checking'}
          problem={problem}
          allowLateEntry={can('sale.late_entry', { branchId: startBranch.id })}
          onStart={(serviceIds, late) => {
            chosen.current = serviceIds;
            lateEntry.current = late;
            setProblem(null);
            unpaid.clear();
            return start.submit();
          }}
          openingUnpaid={opening || unpaid.pending}
          unpaidProblem={unpaid.problem}
          onOpenUnpaid={(visitId) => {
            void unpaid.run(
              () => api<VisitDto>(`/visits/${visitId}`),
              (visit) => {
                setOpening(true);
                router.push(`/sales/${visit.sale.id}`);
              },
            );
          }}
          saved={<SavedCheck state={start.state} onRetry={start.retry} />}
        />
      )}
    </div>
  );
}
