import labels from '@point/i18n/messages/en/receipt.json' with { type: 'json' };
import {
  type ReceiptLineDto,
  type ReceiptViewDto,
  formatDateTime,
  formatMoney,
  moneyFromWire,
  negateMoney,
} from '@point/shared';
import { renderToStaticMarkup } from 'react-dom/server';

import { receiptBaseCss } from '../base-css.js';
import type { PaperWidthMm } from '../paper.js';

// The receipt and the refund receipt (AD-RCPT-01 · D-PAY-06 · OPEN-32 · P4-RULE-18 · add-walkin-visit-
// checkout design D10): one React template rendered to static HTML, so every value is escaped by
// construction — customer and item names are user input. English always: the labels are the `en`
// `receipt.*` texts, the dates and amounts the English formats; an item without an English name prints
// its Myanmar one. Top to bottom as AD-RCPT-01: company and branch, the number and the date, the barber,
// the customer, the lines, the totals, the payments and the change returned, the footer. A refund uses
// the same template with the title "Refund" and the original receipt number; the automatic change
// return has no lines. No logo is drawn in this change (design D10).

const ks = (amount: number) => formatMoney(moneyFromWire(amount), { locale: 'en', profile: 'app' });
const quantityText = (line: ReceiptLineDto) =>
  labels.quantity
    .replace('{quantity}', String(line.quantity))
    .replace('{price}', ks(line.unit_price_amount));

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong === true ? 'row strong' : 'row'}>
      <span>{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

function Line({ line, perItemBarber }: { line: ReceiptLineDto; perItemBarber: boolean }) {
  return (
    <div className="line">
      <div>{line.description_en ?? line.description_mm}</div>
      {line.option !== null && <div>{line.option}</div>}
      {perItemBarber && line.performer !== null && (
        <Row label={labels.barber} value={line.performer} />
      )}
      <Row label={quantityText(line)} value={ks(line.amount)} />
    </div>
  );
}

export interface ReceiptProps {
  readonly view: ReceiptViewDto;
  /** The company name — `name_en`, else `name_mm` (AD-RCPT-01 item 1). */
  readonly company: string;
}

export function Receipt({ view, company }: ReceiptProps) {
  const refund = view.kind === 'refund';
  // One performer: one line under the number; several: one per item (AD-RCPT-01 item 3).
  const oneBarber = view.barbers.length === 1 ? view.barbers[0] : undefined;
  const { footer } = view;
  return (
    <main>
      <header className="center">
        <div className="strong">{company}</div>
        <div>{view.branch.name}</div>
        {view.branch.address !== null && <div>{view.branch.address}</div>}
        {view.branch.phone !== null && <div>{view.branch.phone}</div>}
      </header>
      <hr />
      {refund && <div className="title center">{labels.refund}</div>}
      <div className="number center">{view.number}</div>
      <div className="center">{formatDateTime(view.issued_at, { locale: 'en' })}</div>
      {view.original_number !== null && (
        <Row label={labels.original} value={view.original_number} />
      )}
      {oneBarber !== undefined && <Row label={labels.barber} value={oneBarber} />}
      {view.customer_name !== null && <div>{view.customer_name}</div>}
      {view.customer_phone_masked !== null && <div>{view.customer_phone_masked}</div>}
      {view.lines.length > 0 && (
        <>
          <hr />
          {view.lines.map((line, index) => (
            <Line key={index} line={line} perItemBarber={oneBarber === undefined} />
          ))}
          <hr />
          <Row label={labels.subtotal} value={ks(view.subtotal_amount)} />
        </>
      )}
      {view.discount_amount > 0 && (
        <Row
          label={view.discount_label ?? labels.approvedDiscount}
          value={formatMoney(negateMoney(moneyFromWire(view.discount_amount)), {
            locale: 'en',
            profile: 'app',
          })}
        />
      )}
      {view.service_charge_amount !== null && (
        <Row label={labels.serviceCharge} value={ks(view.service_charge_amount)} />
      )}
      {view.tax_amount !== null && <Row label={labels.tax} value={ks(view.tax_amount)} />}
      <Row label={labels.total} value={ks(view.total_amount)} strong />
      <hr />
      {view.payments.map((payment, index) => (
        <div key={index} className="payment">
          <Row label={payment.method} value={ks(payment.amount)} />
          {payment.reference !== null && <div>{payment.reference}</div>}
        </div>
      ))}
      {view.change_returned !== null && (
        <div>
          {`${labels.changeReturned} ${ks(view.change_returned.amount)} — ${view.change_returned.refund_receipt_number}`}
        </div>
      )}
      {(footer.opening_hours !== null || footer.thank_you !== null) && (
        <footer className="center">
          <hr />
          {footer.opening_hours !== null && <div className="hours">{footer.opening_hours}</div>}
          {footer.thank_you !== null && <div>{footer.thank_you}</div>}
        </footer>
      )}
    </main>
  );
}

/** The layout of the receipt over the base style; every size at least the 22 px body text. */
const RECEIPT_CSS = [
  'main{padding:4px 0 24px}',
  '.center{text-align:center}',
  '.strong{font-weight:700}',
  '.title{font-weight:700;font-size:28px}',
  '.number{font-weight:700;font-size:30px}',
  '.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}',
  '.row>.value{text-align:right;white-space:nowrap}',
  '.row.strong{font-size:26px}',
  '.line,.payment{margin:4px 0}',
  '.hours{white-space:pre-line}',
  'hr{border:0;border-top:2px dashed black;margin:10px 0}',
].join('\n');

/** The receipt's markup alone — what the snapshot tests compare. */
export function receiptMarkup(props: ReceiptProps): string {
  return renderToStaticMarkup(<Receipt {...props} />);
}

/** The whole HTML document the DocumentRenderer loads: fonts and style inline, laid out for `paper`. */
export function receiptHtml(props: ReceiptProps & { readonly paper: PaperWidthMm }): string {
  const css = `${receiptBaseCss(props.paper)}\n${RECEIPT_CSS}`;
  return `<!doctype html>${renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <Receipt view={props.view} company={props.company} />
      </body>
    </html>,
  )}`;
}
