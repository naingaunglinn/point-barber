'use client';

import { type ServiceListItemDto, localized } from '@point/shared';
import { Button, EmployeeChip, Sheet } from '@point/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { startChips } from './start-chips';

// The START sheet of a walk-in (AD-POS-03 · D-VIS-02 · add-walkin-visit-checkout task 10.7): the branch it
// will use (AD-TODAY-03) and the performer = me as a chip; the first 6 simple services of the branch as
// optional chips (a service is optional at START — D-VIS-02); one primary "Start" with its in-flight
// spinner. The screen owns the request: `onStart` gets the chosen service ids in chip order.

export interface StartSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly branch: { readonly id: string; readonly name: string };
  readonly performer: { readonly name: string };
  /** `GET /v1/services?branch_id=&pricing_mode=1`, catalogue order; undefined while it loads. */
  readonly services: readonly ServiceListItemDto[] | undefined;
  /** True while the START request runs. */
  readonly pending: boolean;
  readonly onStart: (serviceIds: readonly string[]) => void | Promise<void>;
}

export function StartSheet({
  open,
  onOpenChange,
  branch,
  performer,
  services,
  pending,
  onStart,
}: StartSheetProps) {
  const t = useTranslations('pos.start');
  const locale = useLocale() as 'my' | 'en';
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const chips = startChips(services ?? []);
  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const ordered = chips.map((chip) => chip.id).filter((id) => chosen.includes(id));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      footer={
        <Button
          variant="primary"
          fullWidth
          loading={pending}
          onClick={() => onStart(ordered)}
          data-testid="start-submit"
        >
          {t('submit')}
        </Button>
      }
    >
      <dl className="grid gap-4">
        <div className="grid gap-1">
          <dt className="text-sm text-muted-foreground">{t('branch')}</dt>
          <dd data-testid="start-branch">{branch.name}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-sm text-muted-foreground">{t('barber')}</dt>
          <dd>
            <EmployeeChip name={performer.name} />
          </dd>
        </div>
      </dl>
      {chips.length > 0 && (
        <fieldset className="mt-4 grid gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">{t('services')}</legend>
          <div className="flex flex-wrap gap-2" data-testid="start-chips">
            {chips.map((chip) => {
              const on = chosen.includes(chip.id);
              return (
                <Button
                  key={chip.id}
                  variant={on ? 'secondary' : 'ghost'}
                  aria-pressed={on}
                  icon={on ? <Check aria-hidden /> : undefined}
                  onClick={() => toggle(chip.id)}
                >
                  {localized(chip, 'name', locale)}
                </Button>
              );
            })}
          </div>
        </fieldset>
      )}
    </Sheet>
  );
}
