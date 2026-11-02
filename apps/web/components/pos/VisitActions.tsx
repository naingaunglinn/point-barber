'use client';

import { Button, FormAlert, ReasonDialog } from '@point/ui';
import { EllipsisVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';

// The actions of the in-progress screen (AD-POS-04 · D-VIS-02 · D-VIS-09 · AD-LAY-04 · add-walkin-visit-
// checkout task 11.6): the primary "Service done · Take payment" (COMPLETE, then the checkout in one tap)
// and, behind the kebab, "Mark incomplete" through the reason dialog (the sale is cancelled — no revenue, no
// commission — visits spec "INCOMPLETE closes a visit that will not be paid"). Each shows only where
// `Sale.actions` allows it. A refusal (`service_required`, `payments_exist` …) is an alert.

export interface VisitActionsProps {
  /** `Sale.actions.edit_lines` — the performer / recorder may complete the visit. */
  readonly canComplete: boolean;
  /** `Sale.actions.mark_incomplete`. */
  readonly canMarkIncomplete: boolean;
  readonly pending: boolean;
  readonly problem?: { readonly code: string; readonly request_id: string } | null;
  readonly onComplete: () => void | Promise<unknown>;
  readonly onIncomplete: (reason: string) => void | Promise<unknown>;
}

export function VisitActions({
  canComplete,
  canMarkIncomplete,
  pending,
  problem = null,
  onComplete,
  onIncomplete,
}: VisitActionsProps) {
  const t = useTranslations('pos.visit');
  const tAction = useTranslations('common.action');
  const [asking, setAsking] = useState(false);
  return (
    <div className="grid gap-2" data-testid="visit-actions">
      {problem !== null && <FormAlert problem={problem} />}
      {canComplete && (
        <Button
          variant="primary"
          fullWidth
          loading={pending}
          onClick={() => onComplete()}
          data-testid="visit-done"
        >
          {t('done')}
        </Button>
      )}
      {canMarkIncomplete && (
        <div className="flex justify-end">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                variant="ghost"
                iconOnly
                icon={<EllipsisVertical />}
                aria-label={tAction('more')}
                data-testid="visit-more"
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-48 rounded-md border border-border bg-background p-1 shadow-md"
              >
                <DropdownMenu.Item
                  className="flex min-h-11 cursor-pointer items-center rounded-sm px-2 text-base text-destructive outline-none data-[highlighted]:bg-muted"
                  onSelect={() => setAsking(true)}
                  data-testid="visit-incomplete"
                >
                  {t('incomplete.title')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}
      {asking && (
        <ReasonDialog
          open
          title={t('incomplete.title')}
          consequence={t('incomplete.consequence')}
          source={{ type: 'free' }}
          confirmLabel={t('incomplete.confirm')}
          destructive
          onCancel={() => setAsking(false)}
          onConfirm={async (result) => {
            await onIncomplete(result.note ?? '');
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}
