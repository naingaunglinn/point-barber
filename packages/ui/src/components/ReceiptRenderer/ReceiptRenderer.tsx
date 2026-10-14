import { createTranslator } from 'next-intl';
import type { ReactNode } from 'react';

import { loadMessages } from '@point/i18n';
import {
  formatDateTime,
  formatMoney,
  negateMoney,
  type Mmk,
  type ReceiptLine,
  type ReceiptView,
} from '@point/shared';

import { DataText } from '../DataText/DataText';

// The on-screen receipt (AD-RCPT-01 · D-PAY-06 · design D10): a `ReceiptView` top to bottom in the
// order of the guideline, in English whatever the UI language — labels from the `en` file
// (`receipt.*`), money and dates in `en`, each line's English description with the Myanmar one as the
// fallback. The language is an input that takes only `en` today: the lines carry both descriptions
// (API Part 4 v1.2), so a Myanmar receipt later needs only the Myanmar labels (owner 12/Oct/2026).
// The printed PNG and the PDF come from the server renderer in packages/documents (ADR-013).

/** The languages a receipt is printed in — English only (AD-RCPT-01). */
export type ReceiptLanguage = 'en';

export interface ReceiptRendererProps {
  readonly receipt: ReceiptView;
  readonly language?: ReceiptLanguage;
}

/** The English description, or the Myanmar one when the line has no English name. */
export function descriptionOf(line: ReceiptLine): string {
  const english = line.description_en?.trim() ?? '';
  return english === '' ? line.description_mm : english;
}

function Row({
  label,
  value,
  strong = false,
}: {
  readonly label: ReactNode;
  readonly value: string;
  readonly strong?: boolean;
}) {
  return (
    <div
      className={
        strong ? 'flex justify-between gap-3 text-base font-bold' : 'flex justify-between gap-3'
      }
    >
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 font-numeric">{value}</dd>
    </div>
  );
}

export function ReceiptRenderer({ receipt, language = 'en' }: ReceiptRendererProps) {
  const t = createTranslator({
    locale: language,
    messages: loadMessages(language),
    namespace: 'receipt',
  });
  const money = (amount: Mmk) => formatMoney(amount, { locale: language, profile: 'app' });
  const { branch, barbers } = receipt;
  // One performer → one Barber line at the top; several → each line names its own (AD-RCPT-01 §3).
  const perLine = barbers.length > 1;
  return (
    <article
      lang={language}
      className="flex w-full max-w-sm flex-col gap-4 rounded-md border border-border bg-card p-4 text-sm"
      data-slot="receipt"
    >
      <header className="flex flex-col items-center gap-1 text-center" data-slot="receipt-branch">
        {branch.logo_url ? <img src={branch.logo_url} alt="" className="h-12 w-auto" /> : null}
        <p className="text-base font-bold">
          <DataText>{branch.name}</DataText>
        </p>
        {branch.address ? (
          <p>
            <DataText>{branch.address}</DataText>
          </p>
        ) : null}
        {branch.phone ? <p className="font-numeric">{branch.phone}</p> : null}
      </header>

      <section className="flex flex-col gap-1" data-slot="receipt-head">
        {receipt.kind === 'refund' ? <p className="text-base font-bold">{t('refund')}</p> : null}
        <p className="font-numeric text-xl font-bold" data-slot="receipt-number">
          {receipt.number}
        </p>
        <time dateTime={receipt.issued_at} className="font-numeric">
          {formatDateTime(receipt.issued_at, { locale: language })}
        </time>
        <dl className="flex flex-col gap-1">
          {receipt.kind === 'refund' && receipt.original_number ? (
            <Row label={t('original')} value={receipt.original_number} />
          ) : null}
          {!perLine && barbers[0] !== undefined ? (
            <div className="flex justify-between gap-3">
              <dt>{t('barber')}</dt>
              <dd className="min-w-0 break-words text-end">
                <DataText>{barbers[0]}</DataText>
              </dd>
            </div>
          ) : null}
        </dl>
        {receipt.customer_name ? (
          <p className="flex flex-wrap gap-x-2" data-slot="receipt-customer">
            <DataText>{receipt.customer_name}</DataText>
            {receipt.customer_phone_masked ? (
              <span className="font-numeric">{receipt.customer_phone_masked}</span>
            ) : null}
          </p>
        ) : null}
      </section>

      <ul className="flex flex-col border-t border-border" data-slot="receipt-lines">
        {receipt.lines.map((line, index) => (
          <li key={index} className="flex flex-col gap-0.5 border-b border-border py-2">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 break-words font-semibold">
                <DataText>{descriptionOf(line)}</DataText>
              </span>
              <span className="shrink-0 font-numeric">{money(line.amount)}</span>
            </div>
            {line.option ? (
              <span className="text-muted-foreground">
                <DataText>{line.option}</DataText>
              </span>
            ) : null}
            <span className="font-numeric text-muted-foreground" data-slot="receipt-quantity">
              {t('quantity', { quantity: line.quantity, price: money(line.unit_price_amount) })}
            </span>
            {perLine && line.performer ? (
              <dl>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <dt>{t('barber')}</dt>
                  <dd className="min-w-0 break-words text-end">
                    <DataText>{line.performer}</DataText>
                  </dd>
                </div>
              </dl>
            ) : null}
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1" data-slot="receipt-totals">
        <Row label={t('subtotal')} value={money(receipt.subtotal_amount)} />
        {receipt.discount_amount > 0n ? (
          <Row
            label={<DataText>{receipt.discount_label ?? t('approvedDiscount')}</DataText>}
            value={money(negateMoney(receipt.discount_amount))}
          />
        ) : null}
        {receipt.service_charge_amount == null ? null : (
          <Row label={t('serviceCharge')} value={money(receipt.service_charge_amount)} />
        )}
        {receipt.tax_amount == null ? null : (
          <Row label={t('tax')} value={money(receipt.tax_amount)} />
        )}
        <Row label={t('total')} value={money(receipt.total_amount)} strong />
      </dl>

      <dl className="flex flex-col gap-1 border-t border-border pt-2" data-slot="receipt-payments">
        {receipt.payments.map((payment, index) => (
          <Row
            key={index}
            label={
              <span className="flex flex-wrap gap-x-2">
                <DataText>{payment.method}</DataText>
                {payment.reference ? (
                  <span className="font-numeric text-muted-foreground">{payment.reference}</span>
                ) : null}
              </span>
            }
            value={money(payment.amount)}
          />
        ))}
        {receipt.change_returned ? (
          <Row
            label={
              <span className="flex flex-wrap gap-x-2">
                <span>{t('changeReturned')}</span>
                <span className="font-numeric text-muted-foreground">
                  {receipt.change_returned.refund_receipt_number}
                </span>
              </span>
            }
            value={money(receipt.change_returned.amount)}
          />
        ) : null}
      </dl>

      {receipt.footer?.opening_hours || receipt.footer?.thank_you ? (
        <footer className="flex flex-col items-center gap-1 text-center" data-slot="receipt-footer">
          {receipt.footer.opening_hours ? (
            <DataText>{receipt.footer.opening_hours}</DataText>
          ) : null}
          {receipt.footer.thank_you ? <DataText>{receipt.footer.thank_you}</DataText> : null}
        </footer>
      ) : null}
    </article>
  );
}
