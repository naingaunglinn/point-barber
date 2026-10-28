'use client';

import {
  type Mmk,
  type PaymentDto,
  type PaymentMethodDto,
  formatMoney,
  localized,
  moneyFromWire,
  subtractMoney,
} from '@point/shared';
import { Button, EmployeeChip, MoneyInput, MoneyText, ReasonDialog, useFormat } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { isCashPayment } from './checkout-money';

// The payments of a sale (AD-POS-08 · AD-CMP-05 · AD-CMP-09 · AD-CONF-01 · add-walkin-visit-checkout task
// 12.5): method, amount, KBZPay reference and the collector's chip on every line; a voided payment stays,
// struck through (D-DAT-05). While the sale is open a payment is voided through the reason dialog — the
// screen sends `reason` (design D12). On a cash line the optional "Customer gave" helper shows the change
// to hand back; it is never sent or stored. A voided line is struck through in the muted tone.

export interface PaymentListProps {
  readonly payments: readonly PaymentDto[];
  readonly methods: readonly Pick<PaymentMethodDto, 'id' | 'is_cash'>[];
  /** True while the sale is OPEN and the caller may take payment (`Sale.actions.take_payment`). */
  readonly canVoid: boolean;
  readonly onVoid: (paymentId: string, reason: string) => void | Promise<unknown>;
}

function CustomerGave({ amount }: { readonly amount: Mmk }) {
  const t = useTranslations('pos.checkout');
  const format = useFormat('PaymentList');
  const [gave, setGave] = useState<Mmk | null>(null);
  const change = gave !== null && gave >= amount ? subtractMoney(gave, amount) : null;
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="w-40">
        <MoneyInput value={gave} onChange={setGave} aria-label={t('customerGave')} />
      </div>
      {change !== null && (
        <span data-testid="cash-change">
          {t('cashChange', { amount: formatMoney(change, format) })}
        </span>
      )}
    </div>
  );
}

export function PaymentList({ payments, methods, canVoid, onVoid }: PaymentListProps) {
  const t = useTranslations('pos.checkout');
  const locale = useLocale() as 'my' | 'en';
  const format = useFormat('PaymentList');
  const [voiding, setVoiding] = useState<PaymentDto | null>(null);
  if (payments.length === 0) return null;
  return (
    <>
      <ul className="grid gap-3" data-testid="payment-list">
        {payments.map((payment) => {
          const voided = payment.voided_at !== null;
          const amount = moneyFromWire(payment.amount);
          return (
            <li
              key={payment.id}
              className="rounded-md border border-border p-3"
              data-voided={voided}
            >
              <div
                className={
                  voided
                    ? 'flex justify-between text-muted-foreground line-through'
                    : 'flex justify-between'
                }
              >
                <span>{localized(payment.payment_method, 'name', locale)}</span>
                <MoneyText amount={amount} />
              </div>
              {payment.external_reference !== null && (
                <div className="text-sm" data-testid="payment-reference">
                  {payment.external_reference}
                </div>
              )}
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t('collectedBy')}</span>
                <EmployeeChip name={payment.collected_by.display_name} />
              </div>
              {!voided && canVoid && isCashPayment(payment, methods) && (
                <CustomerGave amount={amount} />
              )}
              {!voided && canVoid && (
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    onClick={() => setVoiding(payment)}
                    data-testid="payment-void"
                  >
                    {t('voidPayment')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {voiding !== null && (
        <ReasonDialog
          open
          title={t('void.title')}
          consequence={t('void.consequence', {
            method: localized(voiding.payment_method, 'name', locale),
            amount: formatMoney(moneyFromWire(voiding.amount), format),
          })}
          source={{ type: 'free' }}
          confirmLabel={t('void.confirm')}
          destructive
          onCancel={() => setVoiding(null)}
          onConfirm={async (result) => {
            await onVoid(voiding.id, result.note ?? '');
            setVoiding(null);
          }}
        />
      )}
    </>
  );
}
