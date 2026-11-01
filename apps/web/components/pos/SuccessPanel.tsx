'use client';

import { type SaleDto, localized, moneyFromWire } from '@point/shared';
import { Button, EmployeeChip, FlagChip, MoneyText } from '@point/ui';
import { CircleCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

// The success screen of a finished sale (AD-POS-12 · AD-POS-13 · AD-CMP-06 · D-PAY-06 · add-walkin-visit-
// checkout task 13.5): the big check, the receipt number, the total, the payments and the performer; the
// flag "Change returned" with its RF number after an over-transfer; "View / share PDF" on every device and
// the primary "Next customer". It never moves on by itself. No "Print receipt" — no shell reports
// `canBluetoothPrint` in this change (design D12).

export interface SuccessPanelProps {
  readonly sale: SaleDto;
  /** True while the PDF is fetched for sharing. */
  readonly sharing: boolean;
  readonly onShare: () => void | Promise<unknown>;
  readonly onNext: () => void;
}

export function SuccessPanel({ sale, sharing, onShare, onNext }: SuccessPanelProps) {
  const t = useTranslations('pos.success');
  const locale = useLocale() as 'my' | 'en';
  const performers = [
    ...new Set(
      sale.items
        .filter((item) => item.removed_at === null)
        .map((item) => item.effective_performed_by?.display_name)
        .filter((name): name is string => name !== undefined && name !== ''),
    ),
  ];
  const change = sale.refunds.find((refund) => refund.automatic_change);
  return (
    <section className="grid justify-items-center gap-4 text-center" data-testid="success-panel">
      <CircleCheck aria-hidden className="size-16 text-success" />
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <div>
        <div className="text-sm text-muted-foreground">{t('receipt')}</div>
        <div className="text-2xl font-semibold tabular-nums" data-testid="success-number">
          {sale.receipt_number}
        </div>
      </div>
      <div className="text-3xl font-semibold" data-testid="success-total">
        <MoneyText amount={moneyFromWire(sale.total_amount)} />
      </div>
      <ul className="grid gap-1" data-testid="success-payments">
        {sale.payments
          .filter((payment) => payment.voided_at === null)
          .map((payment) => (
            <li key={payment.id}>
              {localized(payment.payment_method, 'name', locale)}{' '}
              <MoneyText amount={moneyFromWire(payment.amount)} />
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap justify-center gap-2">
        {performers.map((name) => (
          <EmployeeChip key={name} name={name} />
        ))}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-2" data-testid="success-change">
          <FlagChip flag="change_returned" />
          <span className="tabular-nums">{change.refund_receipt_number}</span>
        </div>
      )}
      <div className="grid w-full gap-2">
        <Button fullWidth loading={sharing} onClick={() => onShare()} data-testid="success-share">
          {t('share')}
        </Button>
        <Button variant="primary" fullWidth onClick={onNext} data-testid="success-next">
          {t('next')}
        </Button>
      </div>
    </section>
  );
}
