'use client';

import { formatMoney } from '@point/shared';
import { useFormat } from '@point/ui';
import { useTranslations } from 'next-intl';

import type { CheckoutMoney } from './checkout-money';

// "Remaining to pay" and "Change to return" of the checkout (AD-POS-08 · AD-A11Y-04 · add-walkin-visit-
// checkout task 12.6): which line shows comes from `checkoutMoney`; the region is announced to assistive
// technology whenever it changes (`aria-live="polite"`).
export function MoneyStatus({ money }: { readonly money: CheckoutMoney }) {
  const t = useTranslations('pos.checkout');
  const format = useFormat('MoneyStatus');
  return (
    <div aria-live="polite" className="grid gap-1 text-lg" data-testid="money-status">
      {money.remaining !== null && (
        <p data-testid="money-remaining">
          {t('remaining', { amount: formatMoney(money.remaining, format) })}
        </p>
      )}
      {money.changeToReturn !== null && (
        <p data-testid="money-change">
          {t('changeToReturn', { amount: formatMoney(money.changeToReturn, format) })}
        </p>
      )}
    </div>
  );
}
