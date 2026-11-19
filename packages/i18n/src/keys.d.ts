import type { Locale } from './config';
import type { Messages } from './messages';

// Typed keys (design D6): `t('…')` with a key that is not in the English files fails `tsc`.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}
