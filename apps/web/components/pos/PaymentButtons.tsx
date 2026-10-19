'use client';

import { type Mmk, type PaymentMethodDto, localized } from '@point/shared';
import { Button } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';

// The method buttons of the checkout (AD-POS-08 · D-PAY-01 · add-walkin-visit-checkout task 12.2): Cash
// first, then KBZPay, then Split, then the other active methods in their `sort_order`; each at least 72 px
// high. Cash and KBZPay pay the full remaining amount — Cash at once, KBZPay through its reference sheet,
// which the screen opens. While one payment request runs every button is busy, so a double tap records one
// payment (AD-NET-01). Shown only while money is missing (the Finish step follows at 0).

export const CASH_CODE = 'CASH';
export const KBZPAY_CODE = 'KBZPAY';

export interface PaymentButtonsProps {
  /** `GET /v1/payment-methods` — the ACTIVE methods in `sort_order`. */
  readonly methods: readonly PaymentMethodDto[];
  readonly remaining: Mmk;
  /** True while a payment request runs. */
  readonly pending: boolean;
  readonly onMethod: (method: PaymentMethodDto) => void;
  readonly onSplit: () => void;
}

export function orderedMethods(methods: readonly PaymentMethodDto[]): {
  readonly first: readonly PaymentMethodDto[];
  readonly others: readonly PaymentMethodDto[];
} {
  const byCode = (code: string) => methods.find((method) => method.code === code);
  const first = [byCode(CASH_CODE), byCode(KBZPAY_CODE)].filter(
    (method): method is PaymentMethodDto => method !== undefined,
  );
  const others = [...methods]
    .filter((method) => method.code !== CASH_CODE && method.code !== KBZPAY_CODE)
    .sort((a, b) => a.sort_order - b.sort_order);
  return { first, others };
}

export function PaymentButtons({
  methods,
  remaining,
  pending,
  onMethod,
  onSplit,
}: PaymentButtonsProps) {
  const t = useTranslations('pos.checkout');
  const locale = useLocale() as 'my' | 'en';
  if (remaining <= 0n) return null;
  const { first, others } = orderedMethods(methods);
  const button = (key: string, label: string, onClick: () => void) => (
    <Button
      key={key}
      fullWidth
      className="min-h-18"
      loading={pending}
      onClick={onClick}
      data-testid={`pay-${key}`}
    >
      {label}
    </Button>
  );
  return (
    <div className="grid grid-cols-2 gap-3" data-testid="payment-buttons">
      {first.map((method) =>
        button(method.code, localized(method, 'name', locale), () => onMethod(method)),
      )}
      {button('split', t('split'), onSplit)}
      {others.map((method) =>
        button(method.code, localized(method, 'name', locale), () => onMethod(method)),
      )}
    </div>
  );
}
