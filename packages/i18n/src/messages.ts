import type { Locale } from './config';
import attachmentEn from '../messages/en/attachment.json';
import authEn from '../messages/en/auth.json';
import branchEn from '../messages/en/branch.json';
import commonEn from '../messages/en/common.json';
import devuiEn from '../messages/en/devui.json';
import errorEn from '../messages/en/error.json';
import leaveTypeEn from '../messages/en/leaveType.json';
import maintenanceEn from '../messages/en/maintenance.json';
import permissionEn from '../messages/en/permission.json';
import posEn from '../messages/en/pos.json';
import reasonEn from '../messages/en/reason.json';
import receiptEn from '../messages/en/receipt.json';
import settingsEn from '../messages/en/settings.json';
import statusEn from '../messages/en/status.json';
import todayEn from '../messages/en/today.json';
import attachmentMy from '../messages/my/attachment.json';
import authMy from '../messages/my/auth.json';
import branchMy from '../messages/my/branch.json';
import commonMy from '../messages/my/common.json';
import devuiMy from '../messages/my/devui.json';
import errorMy from '../messages/my/error.json';
import leaveTypeMy from '../messages/my/leaveType.json';
import maintenanceMy from '../messages/my/maintenance.json';
import permissionMy from '../messages/my/permission.json';
import posMy from '../messages/my/pos.json';
import reasonMy from '../messages/my/reason.json';
import receiptMy from '../messages/my/receipt.json';
import settingsMy from '../messages/my/settings.json';
import statusMy from '../messages/my/status.json';
import todayMy from '../messages/my/today.json';

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
    auth: authEn,
    today: todayEn,
    pos: posEn,
    settings: settingsEn,
    branch: branchEn,
    maintenance: maintenanceEn,
    permission: permissionEn,
    attachment: attachmentEn,
    leaveType: leaveTypeEn,
  },
  my: {
    common: commonMy,
    status: statusMy,
    error: errorMy,
    reason: reasonMy,
    receipt: receiptMy,
    devui: devuiMy,
    auth: authMy,
    today: todayMy,
    pos: posMy,
    settings: settingsMy,
    branch: branchMy,
    maintenance: maintenanceMy,
    permission: permissionMy,
    attachment: attachmentMy,
    leaveType: leaveTypeMy,
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
