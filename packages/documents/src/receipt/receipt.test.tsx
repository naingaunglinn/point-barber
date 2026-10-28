import type { ReceiptViewDto } from '@point/shared';
import { describe, expect, it } from 'vitest';

import { fontFaceCss } from '../fonts.js';
import { receiptHtml, receiptMarkup } from './receipt.js';

// add-walkin-visit-checkout tasks 9.2 / 9.3 — the receipt and refund-receipt templates (AD-RCPT-01 ·
// D-PAY-06 · OPEN-32 · P4-RULE-18 · sales-checkout spec "The receipt is English with fixed content"):
// HTML snapshots of the fixture receipts, and the rules the snapshots must keep.
const COMPANY = 'Point Barbershop';

const sale = (overrides: Partial<ReceiptViewDto> = {}): ReceiptViewDto => ({
  kind: 'sale',
  number: 'B3-2026-OCT-00002',
  original_number: null,
  issued_at: '2026-10-05T10:50:00+06:30',
  branch: { name: 'Point 3.0', address: null, phone: null, logo_url: null },
  barbers: ['Ko Min'],
  customer_name: null,
  customer_phone_masked: null,
  lines: [
    {
      description_en: 'Haircut',
      description_mm: 'ဆံပင်ညှပ်',
      option: null,
      performer: 'Ko Min',
      quantity: 1,
      unit_price_amount: 8000,
      amount: 8000,
    },
    {
      description_en: 'Shave',
      description_mm: 'မုတ်ဆိတ်ရိတ်',
      option: null,
      performer: 'Ko Min',
      quantity: 1,
      unit_price_amount: 3000,
      amount: 3000,
    },
  ],
  subtotal_amount: 11000,
  discount_label: null,
  discount_amount: 0,
  service_charge_amount: null,
  tax_amount: null,
  total_amount: 11000,
  payments: [
    { method: 'Cash', amount: 5000, reference: null },
    { method: 'KBZPay', amount: 6000, reference: 'KBZ0001234567' },
  ],
  change_returned: null,
  footer: { opening_hours: 'Mon–Sun 9:00 AM – 9:00 PM', thank_you: null },
  pdf_attachment_id: null,
  png_attachment_id: null,
  rendered_at: null,
  ...overrides,
});

/** One element per line, so a snapshot diff names the line that changed. */
const pretty = (html: string) => html.replaceAll('><', '>\n<');
const markup = (view: ReceiptViewDto) => receiptMarkup({ view, company: COMPANY });

describe('receipt template (task 9.2)', () => {
  it('Scenario: Split-payment receipt — Ko Min, Cash 5,000 + KBZPay 6,000, no customer', () => {
    const html = markup(sale());
    expect(pretty(html)).toMatchSnapshot();
    for (const text of [
      'Point Barbershop',
      'B3-2026-OCT-00002',
      '05/Oct/2026 10:50 AM',
      'Barber',
      'Ko Min',
      '1 × 8,000 Ks',
      'Subtotal',
      '11,000 Ks',
      'Total',
      'KBZ0001234567',
      'Mon–Sun 9:00 AM – 9:00 PM',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('Change returned');
  });

  it('Scenario: Myanmar UI, English receipt — every label is the en text', () => {
    const html = markup(sale({ number: 'B3-2026-OCT-00001' }));
    expect(html).not.toMatch(/[က-႟]/);
  });

  it('Scenario: Service without an English name — the Myanmar description', () => {
    const [first, second] = sale().lines;
    const html = markup(sale({ lines: [{ ...first!, description_en: null }, second!] }));
    expect(html).toContain('ဆံပင်ညှပ်');
    expect(pretty(html)).toMatchSnapshot();
  });

  it('Scenario: Customer on the receipt — the name and the masked phone only', () => {
    const html = markup(
      sale({
        number: 'B3-2026-OCT-00001',
        barbers: ['Ko Aung'],
        customer_name: 'Ma Su',
        customer_phone_masked: '09•••••456',
        lines: [
          {
            description_en: 'Haircut',
            description_mm: 'ဆံပင်ညှပ်',
            option: null,
            performer: 'Ko Aung',
            quantity: 1,
            unit_price_amount: 10000,
            amount: 10000,
          },
        ],
        subtotal_amount: 10000,
        total_amount: 10000,
        payments: [{ method: 'Cash', amount: 10000, reference: null }],
      }),
    );
    expect(html).toContain('Ma Su');
    expect(html).toContain('09•••••456');
    expect(html).not.toContain('7712');
    expect(pretty(html)).toMatchSnapshot();
  });

  it('change returned: the line with its amount and refund receipt number', () => {
    const html = markup(
      sale({
        number: 'B3-2026-OCT-00003',
        lines: [sale().lines[0]!],
        subtotal_amount: 8000,
        total_amount: 8000,
        payments: [{ method: 'KBZPay', amount: 10000, reference: 'KBZ0009990000' }],
        change_returned: { amount: 2000, refund_receipt_number: 'B3-RF-2026-OCT-00001' },
      }),
    );
    expect(html).toContain('Change returned (cash) 2,000 Ks — B3-RF-2026-OCT-00001');
    expect(pretty(html)).toMatchSnapshot();
  });

  it('a thank-you value is printed; none → no line', () => {
    const thanks = markup(sale({ footer: { opening_hours: null, thank_you: 'Thank you!' } }));
    expect(thanks).toContain('Thank you!');
    const neither = markup(sale({ footer: { opening_hours: null, thank_you: null } }));
    expect(neither).not.toContain('<footer');
  });

  it('two performers: the barber per item, no barber line under the number', () => {
    const [haircut, shave] = sale().lines;
    const html = markup(
      sale({
        barbers: ['Ko Aung', 'Ko Min'],
        lines: [haircut!, { ...shave!, performer: 'Ko Aung' }],
      }),
    );
    expect(html.match(/>Barber</g)).toHaveLength(2);
    expect(pretty(html)).toMatchSnapshot();
  });

  it('branch address and phone when the branch has them; the opening-hours runs on their own lines', () => {
    const html = markup(
      sale({
        branch: {
          name: 'Point 3.0',
          address: 'No. 12, Example Road',
          phone: '09 400 000 003',
          logo_url: null,
        },
        footer: { opening_hours: 'Mon–Fri 9:00 AM – 9:00 PM\nSat–Sun Closed', thank_you: null },
      }),
    );
    expect(html).toContain('No. 12, Example Road');
    expect(html).toContain('09 400 000 003');
    expect(html).toContain('<div class="hours">Mon–Fri 9:00 AM – 9:00 PM\nSat–Sun Closed</div>');
  });

  it('every value is escaped — a name cannot add markup', () => {
    const html = markup(sale({ customer_name: '<img src=x onerror=alert(1)>' }));
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });
});

describe('refund-receipt template (task 9.3)', () => {
  it('Scenario: Receipt of the automatic change return — title Refund, RF number, original, no lines', () => {
    const html = markup(
      sale({
        kind: 'refund',
        number: 'B3-RF-2026-OCT-00001',
        original_number: 'B3-2026-OCT-00003',
        barbers: [],
        lines: [],
        subtotal_amount: 0,
        total_amount: 2000,
        payments: [{ method: 'Cash', amount: 2000, reference: null }],
      }),
    );
    expect(html).toContain('Refund');
    expect(html).toContain('B3-RF-2026-OCT-00001');
    expect(html).toContain('Original receipt');
    expect(html).toContain('B3-2026-OCT-00003');
    expect(html).not.toContain('Subtotal');
    expect(html).not.toContain('>Barber<');
    expect(html).not.toContain('class="line"');
    expect(pretty(html)).toMatchSnapshot();
  });
});

describe('receiptHtml', () => {
  it('Scenario: Text size on the print image — no text below 22 px', () => {
    const css = receiptHtml({ view: sale(), company: COMPANY, paper: 58 }).replace(
      fontFaceCss(),
      '',
    );
    const sizes = [...css.matchAll(/font-size:(\d+)px/g)].map(([, px]) => Number(px));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(22);
    expect(css).not.toMatch(/font-size:[\d.]+(?:em|rem|%|pt)/);
  });

  it('a whole English document with the fonts and the paper width', () => {
    const html = receiptHtml({ view: sale(), company: COMPANY, paper: 80 });
    expect(html.startsWith('<!doctype html><html lang="en">')).toBe(true);
    // HTML attribute names are case-insensitive; React writes `charSet`.
    expect(html).toContain('<meta charSet="utf-8"/>');
    expect(html).toContain(fontFaceCss());
    expect(html).toContain('body{width:576px;');
  });
});
