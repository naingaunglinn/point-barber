'use client';

import { useTranslations } from 'next-intl';

// The page behind the offline banner's help link (AD-STATE-05 · D-VIS-13 · D-PLT-20 · add-walkin-visit-
// checkout task 10.10): write the service on paper; it is entered with Late entry. No form and no button that
// records anything — the app never queues a money action for later.
export function OfflineHelp() {
  const t = useTranslations('pos.help.offline');
  return (
    <article className="grid gap-3" data-testid="offline-help">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p>{t('body')}</p>
    </article>
  );
}
