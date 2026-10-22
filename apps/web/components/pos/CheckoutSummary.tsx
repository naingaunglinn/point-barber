'use client';

import { type SaleDto, localized, moneyFromWire } from '@point/shared';
import { MoneyText, Stepper } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';

// The top of the checkout (AD-POS-07 · AD-HELP-02 · AD-FMT-01 · sales-checkout spec "The server computes
// the totals" · add-walkin-visit-checkout task 12.1): the progress line "Services ✓ → Payment → Finish",
// the total in `text-3xl` with its "How is this calculated?" breakdown — the active lines, then the
// discount, service charge and tax only when they are not 0, then the total. Every figure is the server's;
// nothing is added up here (CG-MONEY-01). The lines themselves (`SaleLines`) sit under it on the screen.

export function CheckoutSummary({ sale }: { readonly sale: SaleDto }) {
  const t = useTranslations('pos.checkout');
  const locale = useLocale() as 'my' | 'en';
  const paidUp = sale.remaining_amount === 0;
  const extra = [
    ['discount', sale.discount_amount],
    ['serviceCharge', sale.service_charge_amount],
    ['tax', sale.tax_amount],
  ] as const;
  return (
    <section className="grid gap-4" data-testid="checkout-summary">
      <Stepper
        steps={[
          { key: 'services', label: t('progress.services'), state: 'done' },
          { key: 'payment', label: t('progress.payment'), state: paidUp ? 'done' : 'current' },
          { key: 'finish', label: t('progress.finish'), state: paidUp ? 'current' : 'todo' },
        ]}
      />
      <div className="grid gap-1">
        <span className="text-sm text-muted-foreground">{t('total')}</span>
        <span className="text-3xl font-semibold" data-testid="checkout-total">
          <MoneyText amount={moneyFromWire(sale.total_amount)} />
        </span>
        <details className="text-sm" data-testid="checkout-breakdown">
          <summary className="cursor-pointer">{t('howCalculated')}</summary>
          <dl className="mt-2 grid gap-1">
            {sale.items
              .filter((item) => item.removed_at === null)
              .map((item) => (
                <div key={item.id} className="flex justify-between">
                  <dt>{localized(item, 'description', locale)}</dt>
                  <dd>
                    <MoneyText amount={moneyFromWire(item.line_total_amount)} />
                  </dd>
                </div>
              ))}
            {extra
              .filter(([, amount]) => amount !== 0)
              .map(([key, amount]) => (
                <div key={key} className="flex justify-between">
                  <dt>{t(key)}</dt>
                  <dd>
                    <MoneyText amount={moneyFromWire(amount)} />
                  </dd>
                </div>
              ))}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>{t('total')}</dt>
              <dd>
                <MoneyText amount={moneyFromWire(sale.total_amount)} />
              </dd>
            </div>
          </dl>
        </details>
      </div>
    </section>
  );
}
