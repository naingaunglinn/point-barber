'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { type SaleDto, type VisitDto, formatDateTime } from '@point/shared';
import { FormAlert, LockBanner, useFormat } from '@point/ui';

import { FinishedSale } from '../../../../../components/pos/FinishedSale';
import { SaleLines } from '../../../../../components/pos/SaleLines';
import { SuccessPanel } from '../../../../../components/pos/SuccessPanel';
import { shareReceiptPdf } from '../../../../../components/pos/share-receipt';
import { apiBlob } from '../../../../../lib/api/client';
import { type ScreenProblem, screenProblem } from '../../../../../lib/pos/problem';
import { useReceipt } from '../../../../../lib/pos/queries';

// The end states of a sale (AD-POS-13 · AD-DET-03 · AD-RCPT-01 / 02 · add-walkin-visit-checkout tasks
// 13.5 – 13.7): right after FINISH the success panel ("Next customer" → Today, no auto-redirect); a
// finished sale opened again by its link the lock banner and the on-screen receipt; both "View / share
// PDF" — the PDF fetched as a blob, shared or opened. A CANCELLED sale is read-only with its reason.

function useShare(sale: SaleDto) {
  const [sharing, setSharing] = useState(false);
  const [problem, setProblem] = useState<ScreenProblem | null>(null);
  const share = async () => {
    setSharing(true);
    setProblem(null);
    try {
      const pdf = await apiBlob(`/sales/${sale.id}/receipt?format=pdf`);
      await shareReceiptPdf(pdf, `${sale.receipt_number ?? sale.id}.pdf`);
    } catch (error) {
      setProblem(screenProblem(error));
    } finally {
      setSharing(false);
    }
  };
  return { sharing, problem, share };
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
