'use client';

import type { VisitDto } from '@point/shared';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';

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

/**
 * `refusal` is the step's last refusal: a 422 `late_entry_time` means the time this step sent is out of
 * order (design D6 "Errors") — the kept time is set aside and the field shows again, under it the
 * message, so the time can be corrected.
 */
export function useLateEntryStep(
  visit: VisitDto,
  member: LateEntryStepMember,
  refusal?: { readonly code: string } | null,
): LateEntryStep {
  const t = useTranslations('pos.lateEntry');
  const tError = useTranslations('error');
  const { kept, forget } = useLateEntryTimes(visit.id);
  const [entered, setEntered] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [refused, setRefused] = useState(false);
  const late = visit.is_late_entry;
  useEffect(() => {
    if (late && refusal?.code === 'late_entry_time') {
      setRefused(true);
      setEntered(null);
    }
  }, [late, refusal]);
  const keptTime = refused ? null : (kept?.[member] ?? null);
  const error = missing ? tError('required') : refused ? tError('late_entry_time') : undefined;

  const field =
    late && keptTime === null ? (
      <LateEntryTimeField
        label={t(LABEL[member])}
        onChange={(value) => {
          setEntered(value);
          if (value !== null) setMissing(false);
        }}
        {...(error === undefined ? {} : { error })}
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
