import type { Locale } from './config';
import commonEn from '../messages/en/common.json';
import devuiEn from '../messages/en/devui.json';
import errorEn from '../messages/en/error.json';
import reasonEn from '../messages/en/reason.json';
import receiptEn from '../messages/en/receipt.json';
import statusEn from '../messages/en/status.json';
import commonMy from '../messages/my/common.json';
import devuiMy from '../messages/my/devui.json';
import errorMy from '../messages/my/error.json';
import reasonMy from '../messages/my/reason.json';
import receiptMy from '../messages/my/receipt.json';
import statusMy from '../messages/my/status.json';

// The messages of one language, one JSON file per namespace (D-PLT-03 · AD-L10N-01 · design D6).
// The English files define the key set; `pnpm i18n:check` keeps Myanmar equal to it.
const MESSAGES = {
  en: {
    common: commonEn,
    status: statusEn,
    error: errorEn,
    reason: reasonEn,
    receipt: receiptEn,
    devui: devuiEn,
  },
  my: {
    common: commonMy,
    status: statusMy,
    error: errorMy,
    reason: reasonMy,
    receipt: receiptMy,
    devui: devuiMy,
  },
} as const;

export type Messages = (typeof MESSAGES)['en'];

/**
 * The messages of a language. Receipts are printed in English only (AD-RCPT-01), so the Myanmar
 * `receipt.*` values are `null` until a Myanmar receipt is wanted (owner 12/Oct/2026);
 * `ReceiptRenderer` reads `receipt.*` from `loadMessages('en')` alone, never from the UI language.
 */
export function loadMessages(locale: Locale): Messages {
  return MESSAGES[locale] as Messages;
}
