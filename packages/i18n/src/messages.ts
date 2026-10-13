import type { Locale } from './config';
import commonEn from '../messages/en/common.json';
import devuiEn from '../messages/en/devui.json';
import errorEn from '../messages/en/error.json';
import reasonEn from '../messages/en/reason.json';
import statusEn from '../messages/en/status.json';
import commonMy from '../messages/my/common.json';
import devuiMy from '../messages/my/devui.json';
import errorMy from '../messages/my/error.json';
import reasonMy from '../messages/my/reason.json';
import statusMy from '../messages/my/status.json';

// The messages of one language, one JSON file per namespace (D-PLT-03 · AD-L10N-01 · design D6).
// The English files define the key set; `pnpm i18n:check` keeps Myanmar equal to it.
const MESSAGES = {
  en: { common: commonEn, status: statusEn, error: errorEn, reason: reasonEn, devui: devuiEn },
  my: { common: commonMy, status: statusMy, error: errorMy, reason: reasonMy, devui: devuiMy },
} as const;

export type Messages = (typeof MESSAGES)['en'];

export function loadMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}
