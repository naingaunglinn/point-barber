'use client';

import {
  type Mmk,
  type PaymentMethodDto,
  formatMoney,
  localized,
  subtractMoney,
} from '@point/shared';
import {
  Button,
  type FieldError,
  FormAlert,
  FormField,
  MoneyInput,
  Sheet,
  TextInput,
  useFormat,
} from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';

import { orderedMethods } from './PaymentButtons';
import { referenceHint } from './reference-hint';

// The payment sheets of the checkout (AD-POS-08 · AD-FORM-11 · AD-FORM-12 · AD-FORM-04 · add-walkin-
// visit-checkout tasks 12.3, 12.4, 12.7): the KBZPay sheet opens with its method fixed and the amount preset
// to the remaining amount; "Split" adds the method choice. The amount stays editable (a non-cash transfer may
// exceed it — the server answers `amount_exceeds_remaining` for cash); a method that requires a reference
// asks for it, with the expected format as helper text, and nothing is sent without it. A cash amount shows
// the optional "Customer gave" helper. The server's refusals appear on their field; the rest above the form.

export interface PaymentProblem {
  readonly code: string;
  readonly context?: Readonly<Record<string, unknown>>;
  /** Every API problem carries it (API-ERR-01); the alert shows its first 8 characters. */
  readonly request_id: string;
}

export interface PaymentSubmit {
  readonly payment_method_id: string;
  readonly amount: Mmk;
  readonly external_reference?: string;
}

export interface PaymentSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The active methods (`GET /v1/payment-methods`). */
  readonly methods: readonly PaymentMethodDto[];
  /** Set for the KBZPay sheet (method fixed); absent for "Split". */
  readonly method?: PaymentMethodDto;
  readonly remaining: Mmk;
  readonly pending: boolean;
  /** The last refusal of this sheet's request, or null. */
  readonly problem: PaymentProblem | null;
  readonly onSubmit: (payment: PaymentSubmit) => void | Promise<unknown>;
  /** The saved check of a payment without an answer (`SavedCheck`), shown inside the sheet. */
  readonly saved?: ReactNode;
}

const REFERENCE_CODES = new Set(['reference_required', 'reference_format', 'duplicate_reference']);

export function PaymentSheet(props: PaymentSheetProps) {
  const t = useTranslations('pos.checkout');
  const locale = useLocale() as 'my' | 'en';
  const formId = useId();
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      side="bottom"
      title={props.method === undefined ? t('split') : localized(props.method, 'name', locale)}
      footer={
        <Button
          variant="primary"
          type="submit"
          form={formId}
          fullWidth
          loading={props.pending}
          data-testid="payment-submit"
        >
          {t('submit')}
        </Button>
      }
    >
      {props.saved !== undefined && <div className="mb-4">{props.saved}</div>}
      {/* The sheet's content unmounts when it closes, so every opening starts from the preset. */}
      <PaymentForm {...props} formId={formId} />
    </Sheet>
  );
}

function PaymentForm({
  formId,
  methods,
  method,
  remaining,
  problem,
  onSubmit,
}: PaymentSheetProps & { readonly formId: string }) {
  const t = useTranslations('pos.checkout');
  const locale = useLocale() as 'my' | 'en';
  const format = useFormat('PaymentSheet');
  const { first, others } = orderedMethods(methods);
  const choices = [...first, ...others];
  const [methodId, setMethodId] = useState(method?.id ?? choices[0]?.id ?? '');
  const [amount, setAmount] = useState<Mmk | null>(remaining);
  const [reference, setReference] = useState('');
  const [gave, setGave] = useState<Mmk | null>(null);
  const [missing, setMissing] = useState<'amount' | 'reference' | null>(null);
  const chosen = method ?? choices.find((item) => item.id === methodId);
  const hint = referenceHint(chosen?.reference_regex ?? null);
  const helper =
    hint === null
      ? undefined
      : hint.kind === 'digits'
        ? t('referenceHint.digits', { count: hint.count })
        : t('referenceHint.prefixDigits', { prefix: hint.prefix, count: hint.count });

  const referenceError: FieldError | undefined =
    missing === 'reference'
      ? { code: 'reference_required' }
      : problem !== null && REFERENCE_CODES.has(problem.code)
        ? problem.code === 'duplicate_reference' && problem.context?.receipt_number == null
          ? undefined
          : {
              code: problem.code,
              params: { receipt_number: String(problem.context?.receipt_number ?? '') },
            }
        : undefined;
  const referenceInUse =
    problem?.code === 'duplicate_reference' && problem.context?.receipt_number == null;
  const amountError: FieldError | undefined =
    missing === 'amount'
      ? { code: 'required' }
      : problem?.code === 'amount_exceeds_remaining'
        ? { code: 'amount_exceeds_remaining' }
        : undefined;
  const other =
    problem !== null &&
    !REFERENCE_CODES.has(problem.code) &&
    problem.code !== 'amount_exceeds_remaining'
      ? problem
      : null;

  const submit = () => {
    if (chosen === undefined) return undefined;
    if (amount === null || amount <= 0n) {
      setMissing('amount');
      return undefined;
    }
    const trimmed = reference.trim();
    if (chosen.requires_reference && trimmed === '') {
      setMissing('reference');
      return undefined;
    }
    setMissing(null);
    return onSubmit({
      payment_method_id: chosen.id,
      amount,
      ...(trimmed === '' ? {} : { external_reference: trimmed }),
    });
  };

  const change =
    chosen?.is_cash === true && gave !== null && amount !== null && gave >= amount
      ? subtractMoney(gave, amount)
      : null;

  return (
    <form
      id={formId}
      className="grid gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {other !== null && <FormAlert problem={other} />}
      {method === undefined && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm text-muted-foreground">{t('method')}</legend>
          {choices.map((item) => (
            <label key={item.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="payment-method"
                value={item.id}
                checked={methodId === item.id}
                onChange={() => setMethodId(item.id)}
              />
              {localized(item, 'name', locale)}
            </label>
          ))}
        </fieldset>
      )}
      <FormField label={t('amount')} required error={amountError}>
        {(field) => <MoneyInput {...field} value={amount} onChange={setAmount} />}
      </FormField>
      {chosen?.requires_reference === true && (
        <div className="grid gap-1">
          <FormField label={t('reference')} required helper={helper} error={referenceError}>
            {(field) => (
              <TextInput
                {...field}
                value={reference}
                maxLength={100}
                onChange={(value) => {
                  setReference(value);
                  setMissing(null);
                }}
              />
            )}
          </FormField>
          {referenceInUse && (
            <p role="alert" className="text-sm text-destructive" data-testid="reference-in-use">
              {t('referenceInUse')}
            </p>
          )}
        </div>
      )}
      {chosen?.is_cash === true && (
        <div className="grid gap-1">
          <FormField label={t('customerGave')}>
            {(field) => <MoneyInput {...field} value={gave} onChange={setGave} />}
          </FormField>
          {change !== null && (
            <span data-testid="sheet-cash-change">
              {t('cashChange', { amount: formatMoney(change, format) })}
            </span>
          )}
        </div>
      )}
    </form>
  );
}
