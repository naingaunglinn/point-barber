'use client';

import { Button } from '@point/ui';
import { useTranslations } from 'next-intl';

// The arrival step of ＋ Start (AD-POS-02 · D-VIS-01 · add-walkin-visit-checkout task 10.5): the one big
// "Walk-in" button — "Has a booking" comes with add-booking-visit-start (design D12). The tap stays, so the
// tap count of AD-GOAL-01 is measured on the final flow.
export function ArrivalStep({ onWalkIn }: { readonly onWalkIn: () => void }) {
  const t = useTranslations('pos.arrival');
  return (
    <section className="grid gap-4" aria-labelledby="arrival-title">
      <h1 id="arrival-title" className="text-xl font-semibold">
        {t('title')}
      </h1>
      <Button
        variant="primary"
        fullWidth
        className="min-h-18 text-lg"
        onClick={onWalkIn}
        data-testid="arrival-walk-in"
      >
        {t('walkIn')}
      </Button>
    </section>
  );
}
