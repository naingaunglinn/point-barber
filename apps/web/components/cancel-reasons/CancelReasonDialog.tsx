'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';

import {
  type CancelReason,
  type CancelReasonCreate,
  CancelReasonLimits,
  type CancelReasonUpdate,
  ErrorCode,
  type Problem,
} from '@point/shared';
import {
  BilingualInput,
  Button,
  ChoiceGroup,
  Dialog,
  FormAlert,
  FormField,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
  useTextField,
} from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import {
  type CancelReasonFormValues,
  STATUS,
  cancelReasonValues,
  createFormSchema,
  emptyCancelReasonValues,
  updateFormSchema,
} from '../../lib/cancel-reasons/form-values';
import { useCreateCancelReason, useUpdateCancelReason } from '../../lib/cancel-reasons/queries';

// The cancel-reason dialog (add-booking-cancel-reasons spec "The cancel-reason form shows the server's
// answers in place" · AD-FORM-01 / 02 / 04 / 08 / 09 · AD-RT-02 · design D9): the Myanmar name
// (`BilingualInput`, required), the English name, "Note required" and, on edit, Status. The system row
// (`system_code` set) offers its two names and a lock note only. Validated with the API's schema; the
// server's `errors[]` under their fields, 409 `already_exists` under the Myanmar name, 409 `conflict`
// (with Reload) and 409 `system_row` in the alert at the top. Closing with edits asks "Discard changes?".

type Refusal = Pick<Problem, 'code' | 'request_id'>;
const NO_ANSWER: Refusal = { code: 'unknown', request_id: '' };
const refusalOf = (error: unknown): Refusal =>
  error instanceof ApiProblem ? error.problem : NO_ANSWER;

export interface CancelReasonDialogProps {
  /** The reason being edited; absent for Add cancel reason. */
  readonly reason?: CancelReason;
  readonly onClose: () => void;
  /** Loads the list again after a 409 `conflict`; answers the stored reason. */
  readonly onReload: () => Promise<CancelReason | undefined>;
}

export function CancelReasonDialog(props: CancelReasonDialogProps) {
  // After Reload the form starts again from the stored reason (AD-RT-02).
  const [reason, setReason] = useState(props.reason);
  return (
    <CancelReasonFormDialog
      key={reason?.updated_at ?? 'new'}
      {...props}
      reason={reason}
      onReload={async () => {
        const next = await props.onReload();
        setReason(next);
        return next;
      }}
    />
  );
}

function CancelReasonFormDialog({ reason: stored, onClose, onReload }: CancelReasonDialogProps) {
  const t = useTranslations();
  const formId = useId();
  const values = stored === undefined ? emptyCancelReasonValues() : cancelReasonValues(stored);
  const form = useAppForm<CancelReasonFormValues, CancelReasonCreate | CancelReasonUpdate>(
    stored === undefined ? createFormSchema : updateFormSchema(values, stored.updated_at),
    { defaultValues: values },
  );
  const create = useCreateCancelReason();
  const update = useUpdateCancelReason(stored?.id ?? '');
  const [alert, setAlert] = useState<Refusal | null>(null);
  const [conflict, setConflict] = useState(false);
  const [asking, setAsking] = useState(false);
  const mm = useTextField(form, 'name_mm');
  const en = useTextField(form, 'name_en');
  const status = useTextField(form, 'status');
  const requiresNote = form.watch('requires_note');
  const errors = form.formState.errors;
  const nameError = fieldErrorOf(errors, 'name_mm') ?? fieldErrorOf(errors, 'name_en');
  const system = stored?.system_code !== null && stored?.system_code !== undefined;
  const dirty = form.formState.isDirty;

  useEffect(() => {
    if (!dirty) return undefined;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);

  const close = () => (dirty ? setAsking(true) : onClose());

  const submit = form.handleSubmit(async (body) => {
    setAlert(null);
    setConflict(false);
    // Nothing changed: no request, so `updated_at` does not move for nothing.
    if ('expected_updated_at' in body && Object.keys(body).length === 1) {
      onClose();
      return;
    }
    try {
      await ('expected_updated_at' in body ? update.mutateAsync(body) : create.mutateAsync(body));
      toast.success(t('cancelReason.toast.saved'));
      onClose();
    } catch (error) {
      const problem = refusalOf(error);
      if (problem.code === ErrorCode.ALREADY_EXISTS) {
        form.setError('name_mm', { type: ErrorCode.ALREADY_EXISTS }, { shouldFocus: true });
      } else if (problem.code === ErrorCode.CONFLICT) {
        setConflict(true);
      } else {
        setAlert(error instanceof ApiProblem ? applyProblem(form, error.problem) : NO_ANSWER);
      }
    }
  });

  const reload = async () => {
    setAlert(null);
    try {
      await onReload();
    } catch (error) {
      setAlert(refusalOf(error));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : close())}
      title={stored === undefined ? t('cancelReason.form.titleNew') : t('cancelReason.form.titleEdit')}
    >
      <form
        id={formId}
        noValidate
        className="grid gap-6"
        data-testid="cancel-reason-form"
        onSubmit={(event) => void submit(event)}
      >
        {conflict ? (
          <div className="flex flex-wrap items-center gap-3" data-testid="cancel-reason-conflict">
            <FormAlert problem={{ code: ErrorCode.CONFLICT, request_id: '' }} />
            <Button onClick={reload} data-testid="cancel-reason-reload">
              {t('settings.company.reload')}
            </Button>
          </div>
        ) : null}
        {alert === null ? null : <FormAlert problem={alert} data-testid="cancel-reason-alert" />}

        {system ? (
          <p
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="cancel-reason-locked"
          >
            <Lock aria-hidden className="size-4 shrink-0" />
            {t('cancelReason.system.locked')}
          </p>
        ) : null}

        <div data-testid="cancel-reason-field-name_mm">
          <FormField label={t('cancelReason.field.name')} error={nameError}>
            {(control) => (
              <BilingualInput
                {...control}
                required
                maxLength={CancelReasonLimits.NAME_MAX}
                value={{ mm: mm.value, en: en.value === '' ? null : en.value }}
                onChange={(next) => {
                  mm.onChange(next.mm);
                  en.onChange(next.en ?? '');
                }}
                onBlur={(event) => {
                  mm.onBlur(event);
                  en.onBlur(event);
                }}
                ref={mm.ref}
                enRef={en.ref}
                testIds={{ mm: 'cancel-reason-name-mm', en: 'cancel-reason-name-en' }}
              />
            )}
          </FormField>
        </div>

        {system ? null : (
          <div className="grid gap-1" data-testid="cancel-reason-field-requires_note">
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                checked={requiresNote}
                onChange={(event) =>
                  form.setValue('requires_note', event.target.checked, { shouldDirty: true })
                }
                data-testid="cancel-reason-requires-note"
              />
              {t('cancelReason.field.requiresNote')}
            </label>
            <p className="text-sm text-muted-foreground">{t('cancelReason.field.requiresNoteHelp')}</p>
          </div>
        )}

        {stored === undefined || system ? null : (
          <div className="grid gap-1" data-testid="cancel-reason-field-status">
            <ChoiceGroup
              label={t('cancelReason.field.status')}
              options={[
                {
                  value: STATUS.ACTIVE,
                  label: t('status.booking_cancel_reasons.ACTIVE'),
                  testId: 'cancel-reason-active',
                },
                {
                  value: STATUS.INACTIVE,
                  label: t('status.booking_cancel_reasons.INACTIVE'),
                  testId: 'cancel-reason-inactive',
                },
              ]}
              value={status.value}
              onChange={status.onChange}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={close} data-testid="cancel-reason-cancel">
            {t('common.action.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={form.formState.isSubmitting}
            data-testid="cancel-reason-save"
          >
            {t('common.action.save')}
          </Button>
        </div>

        <Dialog
          open={asking}
          onOpenChange={setAsking}
          role="alertdialog"
          title={t('common.form.discard.title')}
          footer={
            <>
              <Button onClick={() => setAsking(false)}>{t('common.action.keepEditing')}</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setAsking(false);
                  onClose();
                }}
              >
                {t('common.action.discard')}
              </Button>
            </>
          }
        />
      </form>
    </Dialog>
  );
}
