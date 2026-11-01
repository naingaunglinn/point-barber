'use client';

import { type ReceiptViewDto, type SaleDto, formatDateTime } from '@point/shared';
import { Button, LockBanner, ReceiptRenderer, useFormat } from '@point/ui';
import { useTranslations } from 'next-intl';

import { toReceiptView } from './receipt-view';

// A finished sale opened again by its link (AD-DET-03 · AD-RCPT-01 · D-VIS-08 · sales-checkout spec "The
// finished sale on screen" · add-walkin-visit-checkout task 13.7): the lock banner (finished when and by
// whom, the correction path), the on-screen receipt from `format=json` as text — no add, remove, pay or void
// control — and "View / share PDF".

export interface FinishedSaleProps {
  readonly sale: SaleDto;
  /** `GET /v1/sales/{id}/receipt?format=json`; undefined while it loads. */
  readonly receipt: ReceiptViewDto | undefined;
  readonly sharing: boolean;
  readonly onShare: () => void | Promise<unknown>;
}

export function FinishedSale({ sale, receipt, sharing, onShare }: FinishedSaleProps) {
  const t = useTranslations('pos');
  const format = useFormat('FinishedSale');
  return (
    <section className="grid gap-4" data-testid="finished-sale">
      <LockBanner
        message={t('finished.locked', {
          datetime: sale.finished_at === null ? '' : formatDateTime(sale.finished_at, format),
          name: sale.finished_by?.display_name ?? '',
        })}
        correction={{ text: t('finished.correction') }}
      />
      {receipt !== undefined && <ReceiptRenderer receipt={toReceiptView(receipt)} />}
      <Button fullWidth loading={sharing} onClick={() => onShare()} data-testid="finished-share">
        {t('success.share')}
      </Button>
    </section>
  );
}
