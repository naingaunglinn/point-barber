'use client';

import type { VisitDto } from '@point/shared';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

import { LateEntryTimeField } from './LateEntryTimeField';
import { type LateEntryStepMember, useLateEntryTimes } from './late-entry-times';

// The time a step of a late entry sends (AD-POS-14 · add-late-entry design D6 · task 4.5): "Service done"
// the completed time, each payment (each part of a split) the received time, Finish the finish time. The
// time kept on this device since START is sent as it is; when it is missing (another device, cleared
// storage) the step shows that one field, empty and required, first (LE-3 ★). A visit that is not a late
// entry sends nothing extra and shows nothing.

const LABEL: Record<LateEntryStepMember, 'completed' | 'received' | 'finished'> = {
  completed_at: 'completed',
  received_at: 'received',
  finished_at: 'finished',
};

export interface LateEntryStep {
  /** The field to show above the step's button, or null. */
  readonly field: ReactNode;
  /**
   * The body member to send — `{}` for a visit that is not a late entry — or null when the time is
   * missing (the field then says it is required and nothing is sent).
   */
  take(): Partial<Record<LateEntryStepMember, string>> | null;
  /** Drops the kept times (after FINISH or INCOMPLETE). */
  forget(): void;
}

export function useLateEntryStep(visit: VisitDto, member: LateEntryStepMember): LateEntryStep {
  const t = useTranslations('pos.lateEntry');
  const tError = useTranslations('error');
  const { kept, forget } = useLateEntryTimes(visit.id);
  const [entered, setEntered] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const keptTime = kept?.[member] ?? null;
  const late = visit.is_late_entry;

  const field =
    late && keptTime === null ? (
      <LateEntryTimeField
        label={t(LABEL[member])}
        onChange={(value) => {
          setEntered(value);
          if (value !== null) setMissing(false);
        }}
        {...(missing ? { error: tError('required') } : {})}
        data-testid={`late-entry-${LABEL[member]}`}
      />
    ) : null;

  return {
    field,
    take() {
      if (!late) return {};
      const value = keptTime ?? entered;
      if (value === null) {
        setMissing(true);
        return null;
      }
      return { [member]: value };
    },
    forget,
  };
}
