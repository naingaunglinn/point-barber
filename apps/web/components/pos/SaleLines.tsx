'use client';

import { type SaleItemDto, formatDuration, localized, moneyFromWire } from '@point/shared';
import { Button, EmployeeChip, MoneyText, ReasonDialog } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

// The service lines of a sale (AD-POS-04 · AD-POS-11 · AD-RSN-01 · D-VIS-05 · add-walkin-visit-checkout
// task 11.3): name, price, duration and the performer's chip on every line; a removed line stays, struck
// through (the row is kept — D-DAT-05). While `Sale.actions.edit_lines` allows it a line is removed through
// the reason dialog and the screen sends `reason` (design D12). The duration comes from the service list,
// since a sale line stores none.

export interface SaleLinesProps {
  readonly items: readonly SaleItemDto[];
  /** Minutes per `service_id`, from the service list or the quote; a line without one shows none. */
  readonly durations?: ReadonlyMap<string, number>;
  readonly canEdit: boolean;
  readonly onRemove: (itemId: string, reason: string) => void | Promise<unknown>;
}

export function SaleLines({ items, durations, canEdit, onRemove }: SaleLinesProps) {
  const t = useTranslations('pos.lines');
  const locale = useLocale() as 'my' | 'en';
  const [removing, setRemoving] = useState<SaleItemDto | null>(null);
  return (
    <>
      <ul className="grid gap-2" data-testid="sale-lines">
        {items.map((item) => {
          const removed = item.removed_at !== null;
          const minutes = item.service_id === null ? undefined : durations?.get(item.service_id);
          return (
            <li
              key={item.id}
              className="rounded-md border border-border p-3"
              data-removed={removed}
            >
              <div
                className={removed ? 'flex justify-between line-through' : 'flex justify-between'}
              >
                <span>{localized(item, 'description', locale)}</span>
                <MoneyText amount={moneyFromWire(item.unit_price_amount)} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                {minutes !== undefined && <span>{formatDuration(minutes, { locale })}</span>}
                {item.effective_performed_by !== null && (
                  <EmployeeChip name={item.effective_performed_by.display_name} />
                )}
              </div>
              {!removed && canEdit && (
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => setRemoving(item)}>
                    {t('remove')}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {removing !== null && (
        <ReasonDialog
          open
          title={t('removeTitle')}
          consequence={t('removeConsequence', {
            service: localized(removing, 'description', locale),
          })}
          source={{ type: 'free' }}
          confirmLabel={t('remove')}
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={async (result) => {
            await onRemove(removing.id, result.note ?? '');
            setRemoving(null);
          }}
        />
      )}
    </>
  );
}
