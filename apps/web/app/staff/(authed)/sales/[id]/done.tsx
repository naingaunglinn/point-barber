'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { type SaleDto, type VisitDto, formatDateTime } from '@point/shared';
import { FormAlert, LockBanner, useFormat } from '@point/ui';

import { FinishedSale } from '../../../../../components/pos/FinishedSale';
import { SaleLines } from '../../../../../components/pos/SaleLines';
import { SuccessPanel } from '../../../../../components/pos/SuccessPanel';
import { shareReceiptPdf } from '../../../../../components/pos/share-receipt';
import { type ScreenProblem, screenProblem } from '../../../../../lib/pos/problem';
import { useReceipt, useReceiptPdf } from '../../../../../lib/pos/queries';

// The end states of a sale (AD-POS-13 · AD-DET-03 · AD-RCPT-01 / 02 · add-walkin-visit-checkout tasks
// 13.5 – 13.7): right after FINISH the success panel ("Next customer" → Today, no auto-redirect); a
// finished sale opened again by its link the lock banner and the on-screen receipt; both "View / share
// PDF". The PDF is loaded as a blob when the screen shows (the button is busy until then), so the tap
// shares or opens it at once, inside the user's gesture; a tap after a failed load loads it again. A
// CANCELLED sale is read-only with its reason.

function useShare(sale: SaleDto) {
  const pdf = useReceiptPdf(sale.id);
  const [asked, setAsked] = useState(false);
  const [problem, setProblem] = useState<ScreenProblem | null>(null);
  // The blob URLs handed to a new tab: kept while the screen is open (the tab may still be reading one),
  // revoked when it leaves.
  const opened = useRef<string[]>([]);
  useEffect(() => {
    const urls = opened.current;
    return () => {
      for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    };
  }, []);
  const share = () => {
    setProblem(null);
    if (pdf.data === undefined) {
      setAsked(true);
      void pdf.refetch();
      return;
    }
    // Nothing is awaited before the share sheet or the new tab opens (see share-receipt.ts).
    shareReceiptPdf(pdf.data, `${sale.receipt_number ?? sale.id}.pdf`, navigator, (url) => {
      opened.current.push(url);
      window.open(url, '_blank', 'noopener');
    }).catch((error: unknown) => setProblem(screenProblem(error)));
  };
  const failed = asked && pdf.isError && !pdf.isFetching ? screenProblem(pdf.error) : null;
  return { sharing: pdf.isFetching, problem: problem ?? failed, share };
}

export function Finished({
  sale,
  justFinished,
}: {
  readonly sale: SaleDto;
  readonly justFinished: boolean;
}) {
  const router = useRouter();
  const receipt = useReceipt(sale.id, !justFinished);
  const { sharing, problem, share } = useShare(sale);
  return (
    <div className="grid gap-4">
      {problem !== null && <FormAlert problem={problem} />}
      {justFinished ? (
        <SuccessPanel
          sale={sale}
          sharing={sharing}
          onShare={share}
          onNext={() => router.push('/today')}
        />
      ) : (
        <FinishedSale sale={sale} receipt={receipt.data} sharing={sharing} onShare={share} />
      )}
    </div>
  );
}

export function Cancelled({
  sale,
  visit,
}: {
  readonly sale: SaleDto;
  readonly visit: VisitDto | undefined;
}) {
  const t = useTranslations('pos.cancelled');
  const format = useFormat('Cancelled');
  const at = visit?.incomplete_at ?? sale.cancelled_at;
  return (
    <div className="grid gap-4" data-testid="sale-cancelled">
      {at !== null && (
        <LockBanner
          message={t('locked', {
            datetime: formatDateTime(at, format),
            name: visit?.incomplete_by?.display_name ?? '',
            reason: visit?.incomplete_reason ?? '',
          })}
        />
      )}
      <SaleLines items={sale.items} canEdit={false} onRemove={() => undefined} />
    </div>
  );
}
