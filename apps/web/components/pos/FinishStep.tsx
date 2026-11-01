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
// is restored by FINISH itself, so nothing is asked either. While the lookup runs Finish waits; when it
// failed the Name is offered (optional — FINISH itself matches the phone), and once FINISH names
// `customer.name` the Name is shown and required, whatever the lookup said. One primary button carries the
// total, in the sticky bottom bar (AD-LAY-04 — above the bottom navigation below 768 px, at the bottom of
// the screen from 768 px), and stays disabled, with the reason under it, while money is missing, a cash
// excess exists or the change of an over-transfer is above 10,000 Ks (`error.change_too_large` — task
// 15.6, owner WR1). Where `Sale.actions.finish_needs_reason` is true, Finish asks for the reason first and
// sends it as `override_reason` (task 13.3). A refusal of FINISH (task 13.4) lands on its field —
// `phone_invalid` on the phone, `validation` of `customer.name` on the name — and every other one in the
// bar above the button, so it is in view wherever the screen is scrolled; one the disabled reason already
// says (`change_too_large` after the reload) is not shown twice. After `total_changed` the screen reloads
// the sale, so the new total is on the button.

/** The screen's lookup of the typed phone (P3.CUS.02). */
export type CustomerLookupState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'existing'; readonly customer: CustomerLookupDto }
  | { readonly kind: 'new' }
  | { readonly kind: 'archived' }
  /** The lookup got no answer or a refusal: whether the phone is known is open. */
  | { readonly kind: 'failed' };

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

// The sticky bar sits on the bottom navigation below 768 px: the navigation's items are `min-h-14`, with a
// 1 px top border and the safe-area inset under them (packages/ui BottomNav); from 768 px there is none.
const FINISH_BAR =
  'sticky bottom-[calc(--spacing(14)+1px+env(safe-area-inset-bottom))] z-10 grid gap-2 border-t border-border bg-background py-3 md:bottom-0';

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
  const tError = useTranslations('error');
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
        : money.finishBlocked === 'change_too_large'
          ? tError('change_too_large')
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

  // FINISH named `customer.name`: the phone is unknown to the server, whatever the lookup said.
  const serverAsksName = problem?.errors?.some((item) => item.field === 'customer.name') === true;
  const nameRequired = lookup.kind === 'new' || serverAsksName;
  const nameShown = nameRequired || lookup.kind === 'failed';

  const finish = () => {
    if (phone.trim() === '') return send(null);
    if (nameRequired && name.trim() === '') {
      setNameMissing(true);
      return undefined;
    }
    if (nameShown && name.trim() !== '') return send({ phone, name: name.trim() });
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
    problem !== null &&
    problem.code !== 'phone_invalid' &&
    nameError === undefined &&
    !(problem.code === 'change_too_large' && money.finishBlocked === 'change_too_large')
      ? problem
      : null;

  return (
    // `contents`: no box of its own, so the bar's sticky range is the whole checkout, not this step.
    <section className="contents" data-testid="finish-step">
      <div className="grid gap-4">
        <div data-testid="finish-phone">
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
        </div>
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
        {lookup.kind === 'new' && <p data-testid="finish-customer">{t('new')}</p>}
        {nameShown && (
          <div data-testid="finish-name">
            <FormField label={t('name')} required={nameRequired} error={nameError}>
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
          </div>
        )}
        {phone !== '' && (
          <Button variant="ghost" onClick={skip}>
            {t('skip')}
          </Button>
        )}
      </div>
      <div className={FINISH_BAR} data-testid="finish-bar">
        {alert !== null && <FormAlert problem={alert} />}
        <Button
          variant="primary"
          fullWidth
          loading={pending}
          disabled={blocked !== undefined || lookup.kind === 'loading'}
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
