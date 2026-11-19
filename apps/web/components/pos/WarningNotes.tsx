'use client';

import type { WarningDto } from '@point/shared';
import { useTranslations } from 'next-intl';

// The warnings an action answers with (API-DATA-10 · visits spec "A service outside the barber's eligibility
// is recorded with a warning" · add-walkin-visit-checkout task 11.5): never a refusal — the line is recorded,
// and the screen notes why it stands out. Only the warning this screen knows is shown.
export function WarningNotes({ warnings }: { readonly warnings: readonly WarningDto[] }) {
  const t = useTranslations('pos.warning');
  const notEligible = warnings.some((warning) => warning.code === 'not_eligible');
  if (!notEligible) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-warning p-2 text-sm"
      data-testid="warning-not-eligible"
    >
      {t('notEligible')}
    </p>
  );
}
