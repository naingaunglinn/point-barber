'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import type { Locale } from '@point/i18n';
import {
  ClientMessageCode,
  ErrorCode,
  type LeaveType,
  type LeaveTypeCreateBody,
  LeaveTypeLimits,
  LeaveTypeStatus,
  type LeaveTypeUpdateBody,
  type Problem,
  localized,
} from '@point/shared';
import {
  BilingualInput,
  Button,
  ChoiceGroup,
  ConfirmDialog,
  Dialog,
  FormAlert,
  FormField,
  ReadOnlyFields,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
  useTextField,
} from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import {
  type LeaveTypeFormValues,
  PAID,
  STATUS,
  createFormSchema,
  emptyLeaveTypeValues,
  leaveTypeValues,
  updateFormSchema,
} from '../../lib/leave-types/form-values';
import {
  useArchiveLeaveType,
  useCreateLeaveType,
  useUpdateLeaveType,
} from '../../lib/leave-types/queries';

// The leave-type dialog (add-leave-types spec "The leave-type form creates and edits a type with messages
// at the fields" · AD-FORM-01 / 02 / 03 / 09 · AD-RT-02 · AD-CONF-01 / 02 · design D9): Name
// (`BilingualInput`, Myanmar required), Paid leave (Paid / Unpaid, nothing chosen on create) and, on edit,
// Status. Validated with the API's schema; the server's `errors[]` under their fields, 409 `already_exists`
// under Name; 409 `conflict` keeps the input and offers Reload. Without company-scope
// `leave_type.update` the values are text. Archive asks first; 409 `leave_type_in_use` stays in the dialog.

type Refusal = Pick<Problem, 'code' | 'request_id'>;
const NO_ANSWER: Refusal = { code: 'unknown', request_id: '' };
const refusalOf = (error: unknown): Refusal =>
  error instanceof ApiProblem ? error.problem : NO_ANSWER;

export interface LeaveTypeDialogProps {
  /** The type being edited; absent for New leave type. */
  readonly leaveType?: LeaveType;
  readonly canUpdate: boolean;
  readonly canArchive: boolean;
  readonly onClose: () => void;
  /** Loads the list again after a 409 `conflict`; answers the stored type. */
  readonly onReload: () => Promise<LeaveType | undefined>;
}

export function LeaveTypeDialog(props: LeaveTypeDialogProps) {
  const t = useTranslations();
  // After Reload the form starts again from the stored type (AD-RT-02).
  const [leaveType, setLeaveType] = useState(props.leaveType);
  const title =
    leaveType === undefined ? t('leaveType.form.titleNew') : t('leaveType.form.titleEdit');
  const readOnly = leaveType !== undefined && (!props.canUpdate || leaveType.archived_at !== null);
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : props.onClose())} title={title}>
      {readOnly ? (
        <LeaveTypeText leaveType={leaveType} />
      ) : (
        <LeaveTypeForm
          key={leaveType?.updated_at ?? 'new'}
          {...props}
          leaveType={leaveType}
          onReload={async () => {
            const next = await props.onReload();
            setLeaveType(next);
            return next;
          }}
        />
      )}
    </Dialog>
  );
}

function LeaveTypeText({ leaveType }: Readonly<{ leaveType: LeaveType }>) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  return (
    <div data-testid="leave-type-form">
      <ReadOnlyFields
        fields={[
          { label: t('leaveType.field.name'), value: localized(leaveType, 'name', locale) },
          {
            label: t('leaveType.field.isPaid'),
            value: leaveType.is_paid ? t('leaveType.list.paid') : t('leaveType.list.unpaid'),
          },
          {
            label: t('leaveType.field.active'),
            value:
              leaveType.archived_at !== null
                ? t('leaveType.list.archived')
                : leaveType.status === LeaveTypeStatus.ACTIVE
                  ? t('status.leave_types.ACTIVE')
                  : t('status.leave_types.INACTIVE'),
          },
        ]}
      />
    </div>
  );
}

function LeaveTypeForm({ leaveType: stored, canArchive, onClose, onReload }: LeaveTypeDialogProps) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const formId = useId();
  const values = stored === undefined ? emptyLeaveTypeValues() : leaveTypeValues(stored);
  const form = useAppForm<LeaveTypeFormValues, LeaveTypeCreateBody | LeaveTypeUpdateBody>(
    stored === undefined ? createFormSchema : updateFormSchema(values, stored.updated_at),
    { defaultValues: values },
  );
  const create = useCreateLeaveType();
  const update = useUpdateLeaveType(stored?.id ?? '');
  const archive = useArchiveLeaveType(stored?.id ?? '');
  const [alert, setAlert] = useState<Refusal | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const mm = useTextField(form, 'name_mm');
  const en = useTextField(form, 'name_en');
  const paid = useTextField(form, 'is_paid');
  const status = useTextField(form, 'status');
  const errors = form.formState.errors;
  const nameError = fieldErrorOf(errors, 'name_mm') ?? fieldErrorOf(errors, 'name_en');
  // Nothing chosen is `invalid_type` from the schema; the field says it is required (the brief).
  const paidError = fieldErrorOf(errors, 'is_paid');

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
      toast.success(t('leaveType.toast.saved'));
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

  const confirmArchive = async () => {
    setConfirming(false);
    setAlert(null);
    try {
      await archive.mutateAsync(undefined);
      onClose();
    } catch (error) {
      setAlert(refusalOf(error));
    }
  };

  return (
    <form
      id={formId}
      noValidate
      className="grid gap-6"
      data-testid="leave-type-form"
      onSubmit={(event) => void submit(event)}
    >
      {conflict ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="leave-type-conflict">
          <FormAlert problem={{ code: ErrorCode.CONFLICT, request_id: '' }} />
          <Button onClick={reload} data-testid="leave-type-reload">
            {t('settings.company.reload')}
          </Button>
        </div>
      ) : null}
      {alert === null ? null : <FormAlert problem={alert} data-testid="leave-type-alert" />}

      <div data-testid="leave-type-field-name_mm">
        <FormField
          label={t('leaveType.field.name')}
          error={
            nameError?.code === ErrorCode.ALREADY_EXISTS
              ? { ...nameError, message: t('leaveType.field.nameTaken') }
              : nameError
          }
        >
          {(control) => (
            <BilingualInput
              {...control}
              required
              maxLength={LeaveTypeLimits.NAME_MAX}
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
              testIds={{ mm: 'leave-type-name-mm', en: 'leave-type-name-en' }}
            />
          )}
        </FormField>
      </div>

      <div className="grid gap-1" data-testid="leave-type-field-is_paid">
        <ChoiceGroup
          label={t('leaveType.field.isPaid')}
          required={stored === undefined}
          options={[
            { value: PAID.PAID, label: t('leaveType.list.paid'), testId: 'leave-type-paid' },
            { value: PAID.UNPAID, label: t('leaveType.list.unpaid'), testId: 'leave-type-unpaid' },
          ]}
          value={paid.value === '' ? null : paid.value}
          onChange={paid.onChange}
          error={
            paidError !== undefined && paid.value === ''
              ? { code: ClientMessageCode.REQUIRED }
              : paidError
          }
        />
        <p className="text-sm text-muted-foreground">{t('leaveType.field.isPaidHelp')}</p>
      </div>

      {stored === undefined ? null : (
        <div className="grid gap-1" data-testid="leave-type-field-status">
          <ChoiceGroup
            label={t('leaveType.field.active')}
            options={[
              {
                value: STATUS.ACTIVE,
                label: t('status.leave_types.ACTIVE'),
                testId: 'leave-type-active',
              },
              {
                value: STATUS.INACTIVE,
                label: t('status.leave_types.INACTIVE'),
                testId: 'leave-type-inactive',
              },
            ]}
            value={status.value}
            onChange={status.onChange}
          />
          <p className="text-sm text-muted-foreground">{t('leaveType.field.activeHelp')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {stored !== undefined && canArchive ? (
          <Button
            variant="destructive"
            className="me-auto"
            onClick={() => setConfirming(true)}
            data-testid="leave-type-archive"
          >
            {t('leaveType.action.archive')}
          </Button>
        ) : null}
        <Button onClick={onClose} data-testid="leave-type-cancel">
          {t('common.action.cancel')}
        </Button>
        <Button
          type="submit"
          form={formId}
          variant="primary"
          loading={form.formState.isSubmitting}
          data-testid="leave-type-save"
        >
          {t('common.action.save')}
        </Button>
      </div>

      {stored === undefined ? null : (
        <ConfirmDialog
          open={confirming}
          title={t('leaveType.archive.title')}
          consequence={t('leaveType.archive.consequence', {
            name: localized(stored, 'name', locale),
          })}
          confirmLabel={t('leaveType.archive.confirm')}
          irreversible
          destructive
          onConfirm={confirmArchive}
          onCancel={() => setConfirming(false)}
        />
      )}
    </form>
  );
}
