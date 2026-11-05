'use client';

import {
  type Instant,
  LateEntryReason,
  type ServiceListItemDto,
  lateEntryOrderViolation,
  localized,
} from '@point/shared';
import {
  Button,
  ChoiceGroup,
  EmployeeChip,
  FormAlert,
  LockBanner,
  Sheet,
  TextInput,
  useNow,
} from '@point/ui';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { LateEntryTimeField } from './LateEntryTimeField';
import { startChips } from './start-chips';

// The START sheet of a walk-in (AD-POS-03 · D-VIS-02 · add-walkin-visit-checkout task 10.7): the branch it
// will use (AD-TODAY-03) and the performer = me as a chip; the first 6 simple services of the branch as
// optional chips (a service is optional at START — D-VIS-02); one primary "Start" with its in-flight
// spinner. The screen owns the request: `onStart` gets the chosen service ids in chip order. A refusal is
// shown in the sheet (task 10.8): `unpaid_visit_open` with a link to that visit (the screen reads it and
// opens its sale — the link busy while it reads, a failed read as an alert under it, the link kept for
// another try), `day_closed` as the lock banner, anything else (`not_assigned_to_branch` …) as an alert.
// With `sale.late_entry` at the branch the sheet offers "Late entry" (AD-POS-14 · add-late-entry tasks
// 4.2 / 4.3): the reason (`ChoiceGroup`), the note for OTHER, and the four times (LE-2 ★); Start checks
// the required fields, then their order (P4-RULE-13) — the first failing field gets the message and
// nothing is sent.

export interface StartSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly branch: { readonly id: string; readonly name: string };
  readonly performer: { readonly name: string };
  /** `GET /v1/services?branch_id=&pricing_mode=1`, catalogue order; undefined while it loads. */
  readonly services: readonly ServiceListItemDto[] | undefined;
  /** True while the START request runs. */
  readonly pending: boolean;
  readonly onStart: (
    serviceIds: readonly string[],
    lateEntry: LateEntryStart | null,
  ) => void | Promise<void>;
  /** `can('sale.late_entry', branch)`: the late-entry link is shown (AD-POS-14 · owner B12). */
  readonly allowLateEntry?: boolean;
  /** The last refusal of START, or null. */
  readonly problem?: StartProblem | null;
  /** `unpaid_visit_open`: open the visit that waits for payment (`context.visit_id`). */
  readonly onOpenUnpaid?: (visitId: string) => void;
  /** True while the screen reads that visit to open its sale. */
  readonly openingUnpaid?: boolean;
  /** The failed read of that visit, or null. */
  readonly unpaidProblem?: StartProblem | null;
  /** The saved check of a START without an answer (`SavedCheck`), shown inside the sheet. */
  readonly saved?: ReactNode;
}

/** A late entry as the sheet took it: the reason, the note and the four times (LE-2 ★). */
export interface LateEntryStart {
  readonly reason: LateEntryReason;
  readonly note?: string;
  readonly started_at: string;
  readonly completed_at: string;
  readonly received_at: string;
  readonly finished_at: string;
}

/** The required asterisk after a label, as FormField shows it. */
const REQUIRED_MARK = '*';

type TimeKey = 'started' | 'completed' | 'received' | 'finished';
type LateField = 'reason' | 'note' | TimeKey;
/** The message code of a late-entry field: the key under `error.` (AD-FORM-02). */
type LateError = 'required' | 'reason_required' | 'late_entry_time';
const TIME_KEYS: readonly TimeKey[] = ['started', 'completed', 'received', 'finished'];
const MEMBER_FIELD: Record<string, TimeKey> = {
  started_at: 'started',
  completed_at: 'completed',
  received_at: 'received',
  finished_at: 'finished',
};
const REASONS = Object.entries(LateEntryReason) as [
  keyof typeof LateEntryReason,
  LateEntryReason,
][];

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
  openingUnpaid = false,
  unpaidProblem = null,
  saved,
  allowLateEntry = false,
}: StartSheetProps) {
  const t = useTranslations('pos.start');
  const tLate = useTranslations('pos.lateEntry');
  const tReason = useTranslations('reason');
  const tError = useTranslations('error');
  const locale = useLocale() as 'my' | 'en';
  const now = useNow();
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const [late, setLate] = useState(false);
  const [reason, setReason] = useState<LateEntryReason | null>(null);
  const [note, setNote] = useState('');
  const [times, setTimes] = useState<Record<TimeKey, string | null>>({
    started: null,
    completed: null,
    received: null,
    finished: null,
  });
  const [errors, setErrors] = useState<Partial<Record<LateField, LateError>>>({});
  const chips = startChips(services ?? []);
  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  const ordered = chips.map((chip) => chip.id).filter((id) => chosen.includes(id));

  // AD-FORM-02 / 03: the required fields first, then the order of the times (P4-RULE-13 — the API's own
  // check, lateEntryOrderViolation); the first failing field gets the message and nothing is sent.
  const start = () => {
    if (!late) return onStart(ordered, null);
    const found: Partial<Record<LateField, LateError>> = {};
    if (reason === null) found.reason = 'required';
    if (reason === LateEntryReason.OTHER && note.trim() === '') {
      found.note = 'reason_required';
    }
    for (const key of TIME_KEYS) if (times[key] === null) found[key] = 'required';
    if (Object.keys(found).length === 0) {
      const violation = lateEntryOrderViolation({
        startedAt: times.started as Instant,
        completedAt: times.completed as Instant,
        receivedAts: [times.received as Instant],
        finishedAt: times.finished as Instant,
        now,
      });
      if (violation !== null) found[MEMBER_FIELD[violation] ?? 'started'] = 'late_entry_time';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return undefined;
    return onStart(ordered, {
      reason: reason as LateEntryReason,
      // The note belongs to OTHER only: one typed for OTHER and left behind is not sent.
      ...(reason === LateEntryReason.OTHER ? { note: note.trim() } : {}),
      started_at: times.started as string,
      completed_at: times.completed as string,
      received_at: times.received as string,
      finished_at: times.finished as string,
    });
  };

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
          onClick={start}
          data-testid="start-submit"
        >
          {t('submit')}
        </Button>
      }
    >
      {saved !== undefined && <div className="mb-4">{saved}</div>}
      {problem?.code === 'day_closed' && <LockBanner message={tError('day_closed')} />}
      {problem?.code === 'unpaid_visit_open' && (
        <div role="alert" className="mb-4 grid gap-2" data-testid="start-unpaid">
          <p>{tError('unpaid_visit_open')}</p>
          {typeof problem.context?.visit_id === 'string' && (
            <Button
              loading={openingUnpaid}
              onClick={() => onOpenUnpaid?.(problem.context?.visit_id as string)}
              data-testid="start-open-unpaid"
            >
              {t('openUnpaid')}
            </Button>
          )}
          {unpaidProblem !== null && <FormAlert problem={unpaidProblem} />}
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
      {allowLateEntry && (
        <section className="mt-4 grid gap-3" data-testid="late-entry">
          <Button
            variant="ghost"
            aria-expanded={late}
            onClick={() => {
              setLate(!late);
              setErrors({});
            }}
            data-testid="late-entry-link"
          >
            {late ? tLate('cancel') : tLate('link')}
          </Button>
          {late && (
            <>
              <ChoiceGroup
                label={tLate('reason')}
                required
                {...(errors.reason ? { error: { code: errors.reason } } : {})}
                options={REASONS.map(([name, code]) => ({
                  value: String(code),
                  label: tReason(name),
                  testId: `late-entry-reason-${code}`,
                }))}
                value={reason === null ? null : String(reason)}
                onChange={(value) => {
                  const chosenReason = REASONS.find(([, code]) => String(code) === value);
                  if (chosenReason !== undefined) setReason(chosenReason[1]);
                }}
              />
              {reason === LateEntryReason.OTHER && (
                <div className="grid gap-1">
                  <label className="text-sm font-medium" htmlFor="late-entry-note">
                    {tLate('note')}{' '}
                    <span data-slot="required-mark" aria-hidden className="ms-1 text-destructive">
                      {REQUIRED_MARK}
                    </span>
                  </label>
                  <TextInput
                    id="late-entry-note"
                    value={note}
                    onChange={setNote}
                    multiline
                    aria-required
                    {...(errors.note ? { 'aria-invalid': true as const } : {})}
                    data-testid="late-entry-note"
                  />
                  {errors.note && (
                    <p role="alert" className="text-sm text-destructive">
                      {tError(errors.note)}
                    </p>
                  )}
                </div>
              )}
              {TIME_KEYS.map((key) => (
                <LateEntryTimeField
                  key={key}
                  label={tLate(key)}
                  onChange={(value) => setTimes((current) => ({ ...current, [key]: value }))}
                  {...(errors[key] ? { error: tError(errors[key]) } : {})}
                  data-testid={`late-entry-${key}`}
                />
              ))}
            </>
          )}
        </section>
      )}
    </Sheet>
  );
}
