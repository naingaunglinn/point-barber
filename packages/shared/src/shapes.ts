import type { Mmk } from './money/mmk.js';
import type { BusinessDate, Instant } from './time/instant.js';

// Response shapes the shared components take, mirrored from the API so that the feature change that
// wires each one has a drop-in type (add-shared-ui-components design: "Tables, endpoints").
// Money members are Mmk: the API client converts each `_amount` integer with moneyFromWire.

/** One receipt line (P4.RCP.01 `format=json` — `ReceiptLine`). */
export interface ReceiptLine {
  readonly description: string;
  readonly option?: string | null;
  readonly performer?: string | null;
  readonly quantity: number;
  readonly unit_price_amount: Mmk;
  readonly amount: Mmk;
}

/** A receipt in English, the data the stored PDF / PNG were rendered from (P4.RCP.01 · AD-RCPT-01). */
export interface ReceiptView {
  readonly kind: 'sale' | 'refund';
  readonly number: string;
  readonly original_number?: string | null;
  readonly issued_at: Instant;
  readonly branch: {
    readonly name: string;
    readonly address?: string | null;
    readonly phone?: string | null;
    readonly logo_url?: string | null;
  };
  readonly barbers: readonly string[];
  readonly customer_name?: string | null;
  readonly customer_phone_masked?: string | null;
  readonly lines: readonly ReceiptLine[];
  readonly subtotal_amount: Mmk;
  readonly discount_label?: string | null;
  readonly discount_amount: Mmk;
  readonly service_charge_amount?: Mmk | null;
  readonly tax_amount?: Mmk | null;
  readonly total_amount: Mmk;
  readonly payments: readonly {
    readonly method: string;
    readonly amount: Mmk;
    readonly reference?: string | null;
  }[];
  readonly change_returned?: {
    readonly amount: Mmk;
    readonly refund_receipt_number: string;
  } | null;
  readonly footer?: { readonly opening_hours?: string | null; readonly thank_you?: string | null };
}

/** A bookable start time (`slots[]` of P2.AVL.02 — `AvailabilitySlot`). */
export interface Slot {
  readonly starts_at: Instant;
  readonly ends_at: Instant;
}

/** The `purpose` of an upload (P8.ATT.01): image → kind 2 · document → kind 1 · import → kind 3. */
export type UploadPurpose = 'image' | 'document' | 'import';

/** Notification category (P8.NTF.01 · D-NTF-03): 1 BOOKING · 2 STAFF · 3 MONEY · 4 STOCK · 5 PAYROLL · 6 SECURITY. */
export const NotificationCategory = {
  BOOKING: 1,
  STAFF: 2,
  MONEY: 3,
  STOCK: 4,
  PAYROLL: 5,
  SECURITY: 6,
} as const;

export type NotificationCategory = (typeof NotificationCategory)[keyof typeof NotificationCategory];

/**
 * One row of the bell (AD-NTF-01 · design D10): the feature change that wires notifications maps
 * a P8.NTF.01 `Notification` to it — `text` from its template, `read` from `read_at`, `href` from
 * `link_path`.
 */
export interface NotificationItem {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly text: string;
  readonly created_at: Instant;
  readonly read: boolean;
  readonly href: string | null;
}

export type { BusinessDate, Instant };
