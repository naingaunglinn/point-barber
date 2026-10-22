'use client';

import { OfflineBanner } from '@point/ui';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';

// The page behind the offline banner's help link (AD-STATE-05 · D-VIS-13 · D-PLT-20 · add-walkin-visit-
// checkout task 10.10): write the service on paper; it is entered with Late entry. No form and no button that
// records anything — the app never queues a money action for later.
//
// The link has to work while the banner is shown, i.e. without a connection (visits spec "Without a
// connection the app points to paper and Late entry"; workbook case 4 of 22/Oct/2026 found the plain link
// answering ERR_INTERNET_DISCONNECTED). So while offline a tap does not load the page: it moves to
// /help/offline in place (history.pushState — Next.js's router follows it without a request) and the shell
// shows the help over the screen, which stays mounted underneath — Back returns to it with its input kept.
// Online the link is an ordinary link.
export const OFFLINE_HELP_PATH = '/help/offline';

export function OfflineHelp() {
  const t = useTranslations('pos.help.offline');
  return (
    <article className="grid gap-3" data-testid="offline-help">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p>{t('body')}</p>
    </article>
  );
}

/** The offline banner of the POS screens; its help link opens the help in place while offline. */
export function StaffOfflineBanner() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = box.current;
    if (element === null) return undefined;
    const openInPlace = (event: MouseEvent) => {
      if (navigator.onLine) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(`a[href="${OFFLINE_HELP_PATH}"]`) === null) return;
      event.preventDefault();
      window.history.pushState(null, '', OFFLINE_HELP_PATH);
    };
    element.addEventListener('click', openInPlace);
    return () => element.removeEventListener('click', openInPlace);
  }, []);
  // `contents`: no box of its own, so the banner stays sticky within the screen.
  return (
    <div ref={box} className="contents">
      <OfflineBanner helpHref={OFFLINE_HELP_PATH} />
    </div>
  );
}

/**
 * The staff shell's content: on /help/offline the help, with the screen it was opened from kept (hidden)
 * underneath; anywhere else the screen. The route's own page renders nothing, so the help exists once.
 */
export function WithOfflineHelp({ children }: { readonly children: ReactNode }) {
  const help = usePathname() === OFFLINE_HELP_PATH;
  return (
    <>
      {help && (
        <div className="mx-auto w-full max-w-3xl">
          <OfflineHelp />
        </div>
      )}
      <div className={help ? 'hidden' : 'contents'}>{children}</div>
    </>
  );
}
