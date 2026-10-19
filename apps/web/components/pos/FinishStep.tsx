'use client';

import {
  type CustomerLookupDto,
  type E164,
  type Instant,
  type Mmk,
  formatDate,
  fieldMessageKey,
  formatMoney,
  moneyFromWire,
} from '@point/shared';
import {
  Button,
  type FieldError,
  FormAlert,
  FormField,
  PhoneInput,
  ReasonDialog,
  TextInput,
  useFormat,
} from '@point/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { CheckoutMoney } from './checkout-money';

// The Finish step (AD-POS-12 · D-VIS-02 · D-CUS-03 · customers spec "The Finish step looks a customer up by
// phone" · add-walkin-visit-checkout tasks 13.1 / 13.2): the phone field already open and optional, with
// "Skip"; as soon as the number is complete the screen looks it up — an existing customer is named ("· last
// visit <date>" when there is one) and nothing more is asked; a new one needs a Name. An archived customer
// is restored by FINISH itself, so nothing is asked either. One primary button carries the total and stays
// disabled, with the reason under it, while money is missing or a cash excess exists. Where
// `Sale.actions.finish_needs_reason` is true, Finish asks for the reason first and sends it as
// `override_reason` (task 13.3). A refusal of FINISH (task 13.4) lands on its field — `phone_invalid` on the
// phone, `validation` of `customer.name` on the name — and every other one above the button; after
// `total_changed` the screen reloads the sale, so the new total is on the button.

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

export interface FinishProblem {
  readonly code: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly errors?: readonly { readonly field: string; readonly code: string }[];
  readonly request_id: string;
}

export interface FinishStepProps {
  readonly total: Mmk;
  readonly money: CheckoutMoney;
  readonly lookup: CustomerLookupState;
  /** The number once complete (E.164), or null while it is not. */
  readonly onPhone: (phone: E164 | null) => void;
  readonly pending: boolean;
  /** `Sale.actions.finish_needs_reason`: a code holder finishing someone else's sale. */
  readonly needsReason?: boolean;
  /** The last refusal of FINISH, or null. */
  readonly problem?: FinishProblem | null;
  readonly onFinish: (
    customer: FinishCustomer | null,
    overrideReason?: string,
  ) => void | Promise<unknown>;
}

export function FinishStep({
  total,
  money,
  lookup,
  onPhone,
  pending,
  needsReason = false,
  problem = null,
  onFinish,
}: FinishStepProps) {
  const t = useTranslations('pos.finish');
  const format = useFormat('FinishStep');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const [asking, setAsking] = useState<FinishCustomer | null | undefined>(undefined);

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

  const send = (customer: FinishCustomer | null) => {
    if (needsReason) {
      setAsking(customer);
      return undefined;
    }
    return onFinish(customer);
  };

  const finish = () => {
    if (phone.trim() === '') return send(null);
    if (lookup.kind === 'new') {
      if (name.trim() === '') {
        setNameMissing(true);
        return undefined;
      }
      return send({ phone, name: name.trim() });
    }
    return send({ phone });
  };

  // A server field issue reads as the client's (API-ERR-03): a missing name is "required".
  const fieldOf = (field: string, value: string): FieldError | undefined => {
    const issue = problem?.errors?.find((item) => item.field === field);
    if (issue === undefined) return undefined;
    const message = fieldMessageKey(issue, value.trim() === '' ? undefined : value);
    return {
      code: message.key.slice('error.'.length),
      params: message.params as Readonly<Record<string, string | number>>,
    };
  };
  const phoneError: FieldError | undefined =
    problem?.code === 'phone_invalid' ? { code: 'phone_invalid' } : undefined;
  const nameError: FieldError | undefined = nameMissing
    ? { code: 'required' }
    : fieldOf('customer.name', name);
  const alert =
    problem !== null && problem.code !== 'phone_invalid' && nameError === undefined
      ? problem
      : null;

  return (
    <section className="grid gap-4" data-testid="finish-step">
      {alert !== null && <FormAlert problem={alert} />}
      <FormField label={t('phone')} error={phoneError}>
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
          <FormField label={t('name')} required error={nameError}>
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
      {asking !== undefined && (
        <ReasonDialog
          open
          title={t('override.title')}
          consequence={t('override.consequence')}
          source={{ type: 'free' }}
          confirmLabel={t('override.confirm')}
          onCancel={() => setAsking(undefined)}
          onConfirm={async (result) => {
            await onFinish(asking, result.note ?? '');
            setAsking(undefined);
          }}
        />
      )}
    </section>
  );
}
