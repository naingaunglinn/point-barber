'use client';

import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';

// No connection (AD-STATE-05 · D-VIS-13 · design D10): a banner that stays at the top while the browser
// is offline or the caller reports the API unreachable, with the late-entry help link. Nothing is
// queued and the forms keep their input — the banner only says so.

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export interface OfflineBannerProps {
  readonly helpHref: string;
  /** True when requests to the API fail for lack of a connection although the browser says online. */
  readonly apiUnreachable?: boolean;
}

export function OfflineBanner({ helpHref, apiUnreachable = false }: OfflineBannerProps) {
  const t = useTranslations('common.offline');
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online && !apiUnreachable) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-warning-subtle px-4 py-3 text-warning"
      data-slot="offline-banner"
    >
      <WifiOff aria-hidden className="size-5 shrink-0" />
      <p className="flex-1 font-semibold">{t('banner')}</p>
      <a href={helpHref} className="font-semibold underline underline-offset-4">
        {t('help')}
      </a>
    </div>
  );
}
