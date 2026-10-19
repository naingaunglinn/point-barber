'use client';

import {
  type CustomerLookupDto,
  type E164,
  type Instant,
  type Mmk,
  formatDate,
  formatMoney,
  moneyFromWire,
} from '@point/shared';
import { Button, FormField, PhoneInput, TextInput, useFormat } from '@point/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { CheckoutMoney } from './checkout-money';

// The Finish step (AD-POS-12 · D-VIS-02 · D-CUS-03 · customers spec "The Finish step looks a customer up by
// phone" · add-walkin-visit-checkout tasks 13.1 / 13.2): the phone field already open and optional, with
// "Skip"; as soon as the number is complete the screen looks it up — an existing customer is named ("· last
// visit <date>" when there is one) and nothing more is asked; a new one needs a Name. An archived customer
// is restored by FINISH itself, so nothing is asked either. One primary button carries the total and stays
// disabled, with the reason under it, while money is missing or a cash excess exists.

/** The screen's lookup of the typed phone (P3.CUS.02). */
export type CustomerLookupState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'existing'; readonly customer: CustomerLookupDto }
  | { readonly kind: 'new' }
  | { readonly kind: 'archived' };

export interface FinishCustomer {
  readonly phone: string;
  readonly name?: string;
}

export interface FinishStepProps {
  readonly total: Mmk;
  readonly money: CheckoutMoney;
  readonly lookup: CustomerLookupState;
  /** The number once complete (E.164), or null while it is not. */
  readonly onPhone: (phone: E164 | null) => void;
  readonly pending: boolean;
  readonly onFinish: (customer: FinishCustomer | null) => void | Promise<unknown>;
}

export function FinishStep({ total, money, lookup, onPhone, pending, onFinish }: FinishStepProps) {
  const t = useTranslations('pos.finish');
  const format = useFormat('FinishStep');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);

  const blocked =
    money.finishBlocked === 'remaining'
      ? t('blocked.remaining', { amount: formatMoney(money.remaining ?? moneyFromWire(0), format) })
      : money.finishBlocked === 'cash_excess'
        ? t('blocked.cashExcess')
        : undefined;

  const skip = () => {
    setPhone('');
    setName('');
    setNameMissing(false);
    onPhone(null);
  };

  const finish = () => {
    if (phone.trim() === '') return onFinish(null);
    if (lookup.kind === 'new') {
      if (name.trim() === '') {
        setNameMissing(true);
        return undefined;
      }
      return onFinish({ phone, name: name.trim() });
    }
    return onFinish({ phone });
  };

  return (
    <section className="grid gap-4" data-testid="finish-step">
      <FormField label={t('phone')}>
        {(field) => (
          <PhoneInput
            {...field}
            value={phone}
            onChange={(value) => {
              setPhone(value.raw);
              setNameMissing(false);
              onPhone(value.e164);
            }}
          />
        )}
      </FormField>
      {lookup.kind === 'existing' && (
        <p data-testid="finish-customer">
          {lookup.customer.last_visit_at === null
            ? t('existing', { name: lookup.customer.name })
            : t('lastVisit', {
                name: lookup.customer.name,
                date: formatDate(lookup.customer.last_visit_at as Instant, format),
              })}
        </p>
      )}
      {lookup.kind === 'new' && (
        <>
          <p data-testid="finish-customer">{t('new')}</p>
          <FormField
            label={t('name')}
            required
            error={nameMissing ? { code: 'required' } : undefined}
          >
            {(field) => (
              <TextInput
                {...field}
                value={name}
                onChange={(value) => {
                  setName(value);
                  setNameMissing(false);
                }}
              />
            )}
          </FormField>
        </>
      )}
      <div className="grid gap-2">
        {phone !== '' && (
          <Button variant="ghost" onClick={skip}>
            {t('skip')}
          </Button>
        )}
        <Button
          variant="primary"
          fullWidth
          loading={pending}
          disabled={blocked !== undefined}
          disabledReason={blocked}
          onClick={() => finish()}
          data-testid="finish-submit"
        >
          {t('submit', { total: formatMoney(total, format) })}
        </Button>
      </div>
    </section>
  );
}
