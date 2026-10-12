import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { LOCALE_COOKIE, resolveLocale } from './locale';
import { loadMessages } from './messages';

// The next-intl request config of the staff tree: no locale segment in the address — the language
// is an account preference (design D6). Before a session exists it is the cookie's, else the system
// default — the same resolution as the staff root layout; add-foundation-auth-access adds the session.
export default getRequestConfig(async () => {
  const locale = resolveLocale({ cookie: (await cookies()).get(LOCALE_COOKIE)?.value });
  return { locale, messages: loadMessages(locale), timeZone: 'Asia/Yangon' };
});
