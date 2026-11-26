'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { z } from 'zod';

import {
  type AlreadyExistsContext,
  type CustomerCreateBody,
  type CustomerDto,
  CustomerLimits,
  ErrorCode,
  type Problem,
  alreadyExistsContextSchema,
} from '@point/shared';
import {
  Button,
  FormAlert,
  FormField,
  PhoneInput,
  TextInput,
  applyProblem,
  fieldErrorOf,
  useAppForm,
  useTextField,
  useUnsavedChanges,
} from '@point/ui';

import { ApiProblem } from '../../lib/api/client';
import type { CustomerFormValues } from '../../lib/customers/form-values';

// The Add customer form (add-customer-management spec "The Add customer form shows an existing customer
// instead of a duplicate" · AD-FORM-01 / 02 / 04 / 08 / 10 · design D11 · task 4.5): Name (required), Phone
// (required — the shared PhoneInput with the grouped preview) and Notes, validated with the API's schema on
// blur and on Save (AD-FORM-03); the server's `errors[]` land under their fields. A 409 `already_exists`
// shows `customer.form.phoneTaken` in an inline alert with *Open customer* and — for an archived holder
// when the user holds `customer.delete` — *Restore*; the typed values stay. Any other refusal is the
// inline alert at the top (AD-FORM-04). A saved form shows the toast `customer.toast.saved`. Leaving with
// unsaved edits asks first, through the shared guard of @point/ui (AD-FORM-08 · add-unsaved-changes-guard).
// The action bar sticks to the bottom (above the bottom navigation on a phone — AD-LAY-03 / 04), as the
// branch form's.

const ACTION_BAR =
  'sticky bottom-[calc(--spacing(14)+1px+env(safe-area-inset-bottom))] z-10 flex items-center gap-2 border-t border-border bg-background py-3 md:bottom-0 md:justify-end';

export interface CustomerFormProps {
  readonly defaultValues: CustomerFormValues;
  readonly schema: z.ZodType<CustomerCreateBody, CustomerFormValues>;
  readonly save: (body: CustomerCreateBody) => Promise<CustomerDto>;
  readonly onSaved: (customer: CustomerDto) => void;
  readonly onCancel: () => void;
  /** *Open customer* of the alert: the page of the holder of the phone. */
  readonly onOpen: (customerId: string) => void;
  /** *Restore* of the alert — only offered when the user may restore (`customer.delete`). */
  readonly onRestore?: (customerId: string) => Promise<void>;
}

/** A refusal as the form shows it; a request that got no answer is `unknown` (the offline banner says why). */
type Refusal = Pick<Problem, 'code' | 'request_id'>;
const NO_ANSWER: Refusal = { code: 'unknown', request_id: '' };

function TextField({
  form,
  name,
  label,
  required = false,
  helper,
  multiline = false,
  maxLength,
}: Readonly<{
  form: ReturnType<typeof useAppForm<CustomerFormValues, CustomerCreateBody>>;
  name: 'name' | 'notes';
  label: string;
  required?: boolean;
  helper?: string;
  multiline?: boolean;
  maxLength: number;
}>) {
  const field = useTextField(form, name);
  return (
    <div data-testid={`customer-field-${name}`}>
      <FormField
        label={label}
        required={required}
        {...(helper === undefined ? {} : { helper })}
        error={fieldErrorOf(form.formState.errors, name)}
      >
        {(control) => <TextInput {...control} {...field} multiline={multiline} maxLength={maxLength} />}
      </FormField>
    </div>
  );
}

function PhoneField({
  form,
  label,
}: Readonly<{
  form: ReturnType<typeof useAppForm<CustomerFormValues, CustomerCreateBody>>;
  label: string;
}>) {
  const field = useTextField(form, 'phone');
  return (
    <div data-testid="customer-field-phone">
      <FormField label={label} required error={fieldErrorOf(form.formState.errors, 'phone')}>
        {(control) => (
          <PhoneInput
            {...control}
            name={field.name}
            value={field.value}
            onChange={(next) => field.onChange(next.raw)}
            onBlur={() => void form.trigger('phone')}
          />
        )}
      </FormField>
    </div>
  );
}

export function CustomerForm({
  defaultValues,
  schema,
  save,
  onSaved,
  onCancel,
  onOpen,
  onRestore,
}: CustomerFormProps) {
  const t = useTranslations();
  const form = useAppForm<CustomerFormValues, CustomerCreateBody>(schema, { defaultValues });
  const [alert, setAlert] = useState<Refusal | null>(null);
  const [taken, setTaken] = useState<AlreadyExistsContext | null>(null);
  const [restoring, setRestoring] = useState(false);
  const dirty = form.formState.isDirty;

  // Leaving with unsaved edits — Cancel, a link, Back, closing the tab — asks through the one shared guard
  // (add-unsaved-changes-guard · AD-FORM-08); `onCancel` leaves through the guarded router.
  useUnsavedChanges(dirty);

  const submit = form.handleSubmit(async (body) => {
    setAlert(null);
    setTaken(null);
    try {
      const saved = await save(body);
      onSaved(saved);
    } catch (error) {
      if (!(error instanceof ApiProblem)) {
        setAlert(NO_ANSWER);
        return;
      }
      const { problem } = error;
      const context = alreadyExistsContextSchema.safeParse(problem.context);
      if (problem.code === ErrorCode.ALREADY_EXISTS && context.success) {
        setTaken(context.data);
      } else {
        setAlert(applyProblem(form, problem));
      }
    }
  });

  const restore = async (customerId: string) => {
    if (onRestore === undefined) return;
    setRestoring(true);
    try {
      await onRestore(customerId);
    } catch (error) {
      setAlert(error instanceof ApiProblem ? error.problem : NO_ANSWER);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <form
      noValidate
      className="grid gap-6"
      data-testid="customer-form"
      onSubmit={(event) => void submit(event)}
    >
      {alert === null ? null : <FormAlert problem={alert} />}
      {taken === null ? null : (
        <div
          role="alert"
          data-testid="customer-phone-taken"
          className="flex flex-col gap-3 rounded-md border border-destructive p-3 text-sm"
        >
          <p className="text-destructive">{t('customer.form.phoneTaken')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onOpen(taken.customer_id)} data-testid="customer-open-existing">
              {t('customer.form.open')}
            </Button>
            {taken.archived && onRestore !== undefined ? (
              <Button
                loading={restoring}
                onClick={() => void restore(taken.customer_id)}
                data-testid="customer-restore-existing"
              >
                {t('customer.form.restore')}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <TextField
        form={form}
        name="name"
        label={t('customer.field.name')}
        required
        maxLength={CustomerLimits.NAME_MAX}
      />
      <PhoneField form={form} label={t('customer.field.phone')} />
      <TextField
        form={form}
        name="notes"
        label={t('customer.field.notes')}
        helper={t('customer.field.notesHelp')}
        multiline
        maxLength={CustomerLimits.NOTES_MAX}
      />

      <div className={ACTION_BAR}>
        <Button onClick={onCancel} data-testid="customer-cancel">
          {t('common.action.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting}
          data-testid="customer-save"
        >
          {t('common.action.save')}
        </Button>
      </div>
    </form>
  );
}
