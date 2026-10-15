'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { formatDuration, type Mmk } from '@point/shared';

import { TABLET, useMinWidth } from '../../hooks/use-min-width';
import { Popover, PopoverAnchor, PopoverContent } from '../../primitives/popover';
import { useFormat } from '../../providers/format';
import type { Bilingual } from '../BilingualInput/BilingualInput';
import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';
import { Sheet } from '../Drawer/Drawer';
import { MoneyText } from '../MoneyText/MoneyText';

// Choosing the options of a service (AD-POS-05 · FE-BK-06 · D-SVC-05 · FE-IMPL-03 · design D10): the
// first option group as chips, then the second limited to the combinations that are sold; the chosen
// combination's price — in the money profile of the tree — and duration before "Add". A bottom sheet
// below 768 px, a popover from 768 px next to its anchor (the `children`).

export interface OptionValue {
  readonly id: string;
  readonly name: Bilingual;
}

export interface OptionGroup {
  readonly id: string;
  readonly name: Bilingual;
  readonly values: readonly OptionValue[];
}

/** One or two option groups (D-SVC-05 · AD-CMP-13): a third does not compile. */
export type OptionGroups = readonly [OptionGroup] | readonly [OptionGroup, OptionGroup];

export interface SoldCell {
  /** One value id per group, in group order. */
  readonly valueIds: readonly string[];
  readonly price_amount: Mmk;
  readonly duration_minutes: number;
}

export interface OptionPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly serviceName: Bilingual;
  readonly groups: OptionGroups;
  /** Sold combinations only. */
  readonly cells: readonly SoldCell[];
  /** Translated hint under the title. */
  readonly hint?: string;
  readonly onAdd: (cell: SoldCell) => void;
  /** The control the popover opens next to (from 768 px). */
  readonly children?: ReactNode;
}

/** A bilingual name in the UI language: English, else Myanmar (AD-L10N-03). */
export function bilingualText(value: Bilingual, locale: 'my' | 'en'): string {
  return locale === 'en' && value.en !== null && value.en.trim() !== '' ? value.en : value.mm;
}

const CHIP = 'relative inline-flex min-h-11 items-center rounded-full border px-3 text-sm';

export function OptionPicker({
  open,
  onOpenChange,
  serviceName,
  groups,
  cells,
  hint,
  onAdd,
  children,
}: OptionPickerProps) {
  const t = useTranslations('common');
  const { locale } = useFormat('OptionPicker');
  const tablet = useMinWidth(TABLET);
  const [first, second] = groups;
  const [chosen, setChosen] = useState<readonly (string | null)[]>([null, null]);

  const firstIds = new Set(cells.map((cell) => cell.valueIds[0]));
  const secondIds = new Set(
    cells.filter((cell) => cell.valueIds[0] === chosen[0]).map((cell) => cell.valueIds[1]),
  );
  const wanted = second === undefined ? [chosen[0]] : [chosen[0], chosen[1]];
  const cell = cells.find((c) => c.valueIds.every((id, i) => id === wanted[i]));

  const chips = (group: OptionGroup, available: Set<string | undefined>, index: number) => (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">
        <DataText>{bilingualText(group.name, locale)}</DataText>
      </legend>
      <div className="flex flex-wrap gap-2">
        {group.values
          .filter((value) => available.has(value.id))
          .map((value) => {
            const pressed = chosen[index] === value.id;
            return (
              <button
                key={value.id}
                type="button"
                aria-pressed={pressed}
                className={cn(
                  CHIP,
                  pressed
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
                onClick={() =>
                  setChosen(index === 0 ? [value.id, null] : [chosen[0] ?? null, value.id])
                }
              >
                <DataText>{bilingualText(value.name, locale)}</DataText>
              </button>
            );
          })}
      </div>
    </fieldset>
  );

  const body = (
    <div className="flex flex-col gap-4" data-slot="option-picker">
      {hint === undefined ? null : <p className="text-sm text-muted-foreground">{hint}</p>}
      {chips(first, firstIds, 0)}
      {second === undefined || chosen[0] === null ? null : chips(second, secondIds, 1)}
      {cell === undefined ? null : (
        <p className="flex flex-wrap items-baseline gap-2" data-slot="option-price">
          <span className="font-numeric text-lg font-bold">
            <MoneyText amount={cell.price_amount} />
          </span>
          <span className="text-sm text-muted-foreground">
            {formatDuration(cell.duration_minutes, { locale })}
          </span>
        </p>
      )}
      <Button
        variant="primary"
        fullWidth
        disabled={cell === undefined}
        onClick={() => cell && onAdd(cell)}
      >
        {t('action.add')}
      </Button>
    </div>
  );

  const title = bilingualText(serviceName, locale);
  if (!tablet) {
    return (
      <>
        {children}
        <Sheet open={open} onOpenChange={onOpenChange} title={title} side="bottom">
          {body}
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <span className="inline-flex">{children}</span>
      </PopoverAnchor>
      <PopoverContent className="w-80" aria-label={title}>
        <p className="mb-3 font-bold">
          <DataText>{title}</DataText>
        </p>
        {body}
      </PopoverContent>
    </Popover>
  );
}
