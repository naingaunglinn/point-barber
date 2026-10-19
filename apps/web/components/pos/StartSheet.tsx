'use client';

import { type ServiceListItemDto, localized } from '@point/shared';
import { Button, EmployeeChip, FormAlert, LockBanner, Sheet } from '@point/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { startChips } from './start-chips';

// The START sheet of a walk-in (AD-POS-03 · D-VIS-02 · add-walkin-visit-checkout task 10.7): the branch it
// will use (AD-TODAY-03) and the performer = me as a chip; the first 6 simple services of the branch as
// optional chips (a service is optional at START — D-VIS-02); one primary "Start" with its in-flight
// spinner. The screen owns the request: `onStart` gets the chosen service ids in chip order. A refusal is
// shown in the sheet (task 10.8): `unpaid_visit_open` with a link to that visit (the screen reads it and
// opens its sale), `day_closed` as the lock banner, anything else (`not_assigned_to_branch` …) as an alert.

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
  /** The last refusal of START, or null. */
  readonly problem?: StartProblem | null;
  /** `unpaid_visit_open`: open the visit that waits for payment (`context.visit_id`). */
  readonly onOpenUnpaid?: (visitId: string) => void;
}

export interface StartProblem {
  readonly code: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly request_id: string;
}

export function StartSheet({
  open,
  onOpenChange,
  branch,
  performer,
  services,
  pending,
  onStart,
  problem = null,
  onOpenUnpaid,
}: StartSheetProps) {
  const t = useTranslations('pos.start');
  const tError = useTranslations('error');
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
      {problem?.code === 'day_closed' && <LockBanner message={tError('day_closed')} />}
      {problem?.code === 'unpaid_visit_open' && (
        <div role="alert" className="mb-4 grid gap-2" data-testid="start-unpaid">
          <p>{tError('unpaid_visit_open')}</p>
          {typeof problem.context?.visit_id === 'string' && (
            <Button onClick={() => onOpenUnpaid?.(problem.context?.visit_id as string)}>
              {t('openUnpaid')}
            </Button>
          )}
        </div>
      )}
      {problem !== null &&
        problem.code !== 'day_closed' &&
        problem.code !== 'unpaid_visit_open' && (
          <div className="mb-4">
            <FormAlert problem={problem} />
          </div>
        )}
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
