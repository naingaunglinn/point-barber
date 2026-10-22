'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useRef, useState } from 'react';

import type { Locale } from '@point/i18n';
import { type RequestLookupDto, type VisitDto, localized } from '@point/shared';
import { OfflineBanner } from '@point/ui';

import { ArrivalStep } from '../../../../../components/pos/ArrivalStep';
import { SavedCheck } from '../../../../../components/pos/SavedCheck';
import { StartSheet } from '../../../../../components/pos/StartSheet';
import { useSavedSubmit } from '../../../../../components/pos/use-saved-submit';
import { api, apiWithMeta } from '../../../../../lib/api/client';
import { type ScreenProblem, screenProblem } from '../../../../../lib/pos/problem';
import { lookupRequest, useServices, useStore } from '../../../../../lib/pos/queries';
import { useBranch } from '../../../../../lib/session/branch';
import { useMe } from '../../../../../lib/session/use-me';

// ＋ Start → arrival step ("Walk-in") → the START sheet (AD-POS-01 / 02 / 03 · AD-NET-01 / 02 ·
// add-walkin-visit-checkout tasks 10.5 – 10.9). One Idempotency-Key per tap on Start, kept across its
// retries; after 15 s without an answer the key is looked up. The visit opens on the screen of its sale.
export function NewVisitScreen() {
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

  const start = useSavedSubmit<{ data: VisitDto }, RequestLookupDto>({
    send: (key) =>
      apiWithMeta<VisitDto>('/visits', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          branch_id: startBranch?.id,
          items: chosen.current.map((service_id) => ({ service_id })),
        },
      }),
    lookup: lookupRequest,
    onSent: ({ data: visit }) => {
      store.visit(visit);
      setOpening(true);
      router.push(`/sales/${visit.sale.id}`);
    },
    onFound: (found) => {
      if (found.sale_id === null) return;
      setOpening(true);
      router.push(`/sales/${found.sale_id}`);
    },
    onRefused: (error) => setProblem(screenProblem(error)),
  });

  if (me === undefined) return null;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="new-visit">
      <OfflineBanner helpHref="/help/offline" />
      <ArrivalStep
        onWalkIn={() => {
          setProblem(null);
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
          onStart={(serviceIds) => {
            chosen.current = serviceIds;
            setProblem(null);
            return start.submit();
          }}
          onOpenUnpaid={async (visitId) => {
            const visit = await api<VisitDto>(`/visits/${visitId}`);
            router.push(`/sales/${visit.sale.id}`);
          }}
          saved={<SavedCheck state={start.state} onRetry={start.retry} />}
        />
      )}
    </div>
  );
}
