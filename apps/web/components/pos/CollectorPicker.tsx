'use client';

import type { CollectorDto } from '@point/shared';
import { ChoiceGroup, ErrorState, Skeleton } from '@point/ui';
import { useTranslations } from 'next-intl';

import { screenProblem } from '../../lib/pos/problem';
import { useCollectors } from '../../lib/pos/queries';

// "Who collected the money?" (AD-POS-08 · AD-CMP-09 · AD-FORM-14 · D-VIS-06 · owner B3 · add-payment-
// collector-picker design D5 / CL4): the list of `GET /v1/sales/{id}/collectors` in the server's order
// as a choice of exactly one — radio buttons up to 7 people, a searchable list from 8 (ChoiceGroup) —
// with "Clocked in" and "Default" as text beside the name (never colour only — AD-A11Y-03). The loading
// and error states show only while there is no list (error-state order: `data === undefined`).

/** The text of one choice: the name, then the marks that apply. */
export function collectorLabel(
  item: CollectorDto,
  marks: { readonly clockedIn: string; readonly default: string },
): string {
  return [
    item.display_name,
    ...(item.clocked_in ? [marks.clockedIn] : []),
    ...(item.is_default ? [marks.default] : []),
  ].join(' · ');
}

export interface CollectorPickerProps {
  readonly saleId: string;
  /** The chosen employee id; null shows nobody chosen. */
  readonly value: string | null;
  readonly onChange: (employeeId: string) => void;
}

export function CollectorPicker({ saleId, value, onChange }: CollectorPickerProps) {
  const t = useTranslations('pos.collector');
  const list = useCollectors(saleId);
  if (list.data === undefined) {
    return list.isError ? (
      <ErrorState problem={screenProblem(list.error)} onRetry={() => list.refetch()} />
    ) : (
      <div aria-busy="true">
        <Skeleton shape="text" />
      </div>
    );
  }
  const marks = { clockedIn: t('clockedIn'), default: t('default') };
  return (
    <ChoiceGroup
      aria-label={t('title')}
      searchLabel={t('search')}
      options={list.data.items.map((item) => ({
        value: item.employee_id,
        label: collectorLabel(item, marks),
        testId: `collector-${item.employee_id}`,
      }))}
      value={value}
      onChange={onChange}
      data-testid="collector-picker"
    />
  );
}
