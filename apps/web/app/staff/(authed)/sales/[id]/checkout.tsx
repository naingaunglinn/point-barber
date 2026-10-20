'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import {
  type E164,
  type PaymentMethodDto,
  type RequestLookupDto,
  type SaleDto,
  type VisitDto,
  moneyFromWire,
  moneyToWire,
} from '@point/shared';
import { FormAlert, toast } from '@point/ui';

import { CheckoutSummary } from '../../../../../components/pos/CheckoutSummary';
import { type CustomerLookupState, FinishStep } from '../../../../../components/pos/FinishStep';
import { MoneyStatus } from '../../../../../components/pos/MoneyStatus';
import { PaymentButtons } from '../../../../../components/pos/PaymentButtons';
import { PaymentList } from '../../../../../components/pos/PaymentList';
import { PaymentSheet, type PaymentSubmit } from '../../../../../components/pos/PaymentSheet';
import { SavedCheck } from '../../../../../components/pos/SavedCheck';
import { VisitActions } from '../../../../../components/pos/VisitActions';
import { checkoutMoney } from '../../../../../components/pos/checkout-money';
import { useSavedSubmit } from '../../../../../components/pos/use-saved-submit';
import { api, apiWithMeta } from '../../../../../lib/api/client';
import { type ScreenProblem, screenProblem } from '../../../../../lib/pos/problem';
import {
  lookupCustomer,
  lookupRequest,
  usePaymentMethods,
  useStore,
} from '../../../../../lib/pos/queries';
import { useAction } from '../../../../../lib/pos/use-action';
import { SaleLinesEditor } from './in-progress';

// The checkout of a COMPLETED visit (AD-POS-07 / 08 / 12 · D-PAY-01 / 02 / 05 · D-VIS-06 ·
// add-walkin-visit-checkout groups 12 – 13): the total and its breakdown, the lines (a service added now
// needs "Why was this added?"), the payments with void, then — while money remains — Cash (the whole
// remaining amount at once), KBZPay (the reference sheet) and Split; at 0 the Finish step. A payment carries
// one Idempotency-Key per tap, kept across its retries; a replay reads "Already saved".

interface PaymentBody {
  readonly payment_method_id: string;
  readonly amount: number;
  readonly external_reference?: string;
}

export function Checkout({
  sale,
  visit,
  onFinished,
}: {
  readonly sale: SaleDto;
  readonly visit: VisitDto;
  readonly onFinished: () => void;
}) {
  const t = useTranslations('pos.saved');
  const store = useStore();
  const methods = usePaymentMethods();
  // Void and incomplete share one action and the alert at the top; FINISH has its own, shown by the
  // Finish step on its fields or above its button — never twice.
  const action = useAction(() => store.reloadSale(sale.id));
  const finishing = useAction(() => store.reloadSale(sale.id));
  const [sheet, setSheet] = useState<{ readonly method?: PaymentMethodDto } | null>(null);
  const [payProblem, setPayProblem] = useState<ScreenProblem | null>(null);
  const [lookup, setLookup] = useState<CustomerLookupState>({ kind: 'none' });
  const body = useRef<PaymentBody | null>(null);

  const pay = useSavedSubmit<{ data: SaleDto; replayed: boolean }, RequestLookupDto>({
    send: (key) =>
      apiWithMeta<SaleDto>(`/sales/${sale.id}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: body.current,
      }),
    lookup: lookupRequest,
    onSent: ({ data, replayed }) => {
      store.sale(data);
      setSheet(null);
      if (replayed) toast.success(t('already'));
    },
    onFound: () => {
      void store.reloadSale(sale.id);
      setSheet(null);
      toast.success(t('already'));
    },
    onRefused: (error) => setPayProblem(screenProblem(error)),
  });

  const submit = (payment: PaymentBody) => {
    body.current = payment;
    setPayProblem(null);
    return pay.submit();
  };
  const fromSheet = (payment: PaymentSubmit) =>
    submit({
      payment_method_id: payment.payment_method_id,
      amount: moneyToWire(payment.amount),
      ...(payment.external_reference === undefined
        ? {}
        : { external_reference: payment.external_reference }),
    });

  const active = methods.data ?? [];
  const money = checkoutMoney(sale, active);
  const paying = pay.state === 'sending' || pay.state === 'checking';

  const onPhone = (phone: E164 | null) => {
    if (phone === null) {
      setLookup({ kind: 'none' });
      return;
    }
    setLookup({ kind: 'loading' });
    lookupCustomer(phone).then(
      (found) =>
        setLookup(
          found.customer !== null
            ? { kind: 'existing', customer: found.customer }
            : found.archived === true
              ? { kind: 'archived' }
              : { kind: 'new' },
        ),
      () => setLookup({ kind: 'none' }),
    );
  };

  return (
    <div className="grid gap-4" data-testid="checkout">
      <CheckoutSummary sale={sale} />
      <SaleLinesEditor sale={sale} visit={visit} />
      {action.problem !== null && <FormAlert problem={action.problem} />}
      <PaymentList
        payments={sale.payments}
        methods={active}
        canVoid={sale.actions.take_payment}
        onVoid={(paymentId, reason) =>
          action.run(
            () => api<SaleDto>(`/payments/${paymentId}/void`, { method: 'POST', body: { reason } }),
            store.sale,
          )
        }
      />
      {sale.remaining_amount > 0 && sale.actions.take_payment && (
        <section className="grid gap-3">
          <MoneyStatus money={money} />
          {payProblem !== null && sheet === null && <FormAlert problem={payProblem} />}
          {sheet === null && <SavedCheck state={pay.state} onRetry={pay.retry} />}
          <PaymentButtons
            methods={active}
            remaining={moneyFromWire(sale.remaining_amount)}
            pending={paying}
            onMethod={(method) => {
              if (method.is_cash) {
                setSheet(null);
                void submit({ payment_method_id: method.id, amount: sale.remaining_amount });
              } else {
                setPayProblem(null);
                setSheet({ method });
              }
            }}
            onSplit={() => {
              setPayProblem(null);
              setSheet({});
            }}
          />
          <PaymentSheet
            open={sheet !== null}
            onOpenChange={(open) => {
              if (!open) setSheet(null);
            }}
            methods={active}
            {...(sheet?.method === undefined ? {} : { method: sheet.method })}
            remaining={moneyFromWire(sale.remaining_amount)}
            pending={paying}
            problem={payProblem}
            onSubmit={fromSheet}
            saved={<SavedCheck state={pay.state} onRetry={pay.retry} />}
          />
        </section>
      )}
      {sale.remaining_amount === 0 && sale.actions.finish && (
        <FinishStep
          total={moneyFromWire(sale.total_amount)}
          money={money}
          lookup={lookup}
          onPhone={onPhone}
          pending={finishing.pending}
          needsReason={sale.actions.finish_needs_reason}
          problem={finishing.problem}
          onFinish={(customer, overrideReason) =>
            finishing.run(
              () =>
                api<SaleDto>(`/sales/${sale.id}/finish`, {
                  method: 'POST',
                  body: {
                    expected_total_amount: sale.total_amount,
                    customer,
                    ...(overrideReason === undefined ? {} : { override_reason: overrideReason }),
                  },
                }),
              (finished) => {
                store.sale(finished);
                onFinished();
              },
            )
          }
        />
      )}
      <VisitActions
        canComplete={false}
        canMarkIncomplete={sale.actions.mark_incomplete}
        pending={action.pending}
        problem={null}
        onComplete={() => undefined}
        onIncomplete={(reason) =>
          action.run(
            () =>
              api<VisitDto>(`/visits/${visit.id}/incomplete`, {
                method: 'POST',
                body: { reason },
              }),
            store.visit,
          )
        }
      />
    </div>
  );
}
