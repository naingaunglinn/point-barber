'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { Mmk, Problem, SettingKey, SettingView } from '@point/shared';
import { settingEntry } from '@point/shared';
import {
  BilingualInput,
  Button,
  ChoiceGroup,
  ConfirmDialog,
  FormAlert,
  FormField,
  MoneyInput,
  Switch,
  TextInput,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
  useFormat,
} from '@point/ui';

import { ApiProblem } from '../../../lib/api/client';
import { useSaveSetting } from '../../../lib/settings/queries';
import {
  type DraftValue,
  type Translate,
  choicesOf,
  controlOf,
  draftOf,
  formatSettingValue,
  rowSchemaOf,
  unitKeyOf,
} from './setting-values';

// One editable value of Additional settings — the company value of a row, or one branch's override in
// the overrides drawer (AD-SET-01 · AD-SET-02 · AD-SET-03 · AD-FORM-02 – 04 · AD-TOAST-01 · owner SS3 = C ·
// design D10 · tasks 5.5, 5.6, 5.9): the control of the key's type, the API's value schema on blur and on
// Save (a refused value is not sent), the server's field errors on the field and any other refusal
// inline, a success toast. A key with an impact note asks first: the confirm step names the typed value
// and the note, and Cancel sends nothing; any other key saves at once (AD-CONF-01).

const DIGITS = 'numeric';

export interface SettingFormProps {
  readonly settingKey: SettingKey;
  readonly view: SettingView;
  /** A branch override; absent = the company value. */
  readonly branchId?: string;
  /** Translated label of the field ("Home-service transport fee", or the branch's name in the drawer). */
  readonly label: string;
  readonly helper?: string;
  readonly testId: string;
}

export function SettingForm({
  settingKey,
  view,
  branchId,
  label,
  helper,
  testId,
}: SettingFormProps) {
  const tSettings = useTranslations('settings');
  const t = useTranslations() as unknown as Translate;
  const format = useFormat('SettingForm');
  const entry = settingEntry(settingKey);
  const kind = controlOf(settingKey);
  const form = useAppForm(rowSchemaOf(settingKey), {
    defaultValues: { value: draftOf(settingKey, view.effective) },
  });
  const save = useSaveSetting();
  const [pending, setPending] = useState<{ readonly value: unknown } | undefined>();
  const [alert, setAlert] = useState<Pick<Problem, 'code' | 'request_id'> | null>(null);

  const draft = form.watch('value') as DraftValue;
  const error =
    fieldErrorOf(form.formState.errors, 'value') ??
    fieldErrorOf(form.formState.errors, 'value.mm') ??
    fieldErrorOf(form.formState.errors, 'value.en');
  // An emptied money or number field holds no value at all, so the schema reports it as missing
  // (`error.required`), not as a wrong format.
  const set = (next: DraftValue) => {
    form.setValue('value', next === null || next === '' ? undefined : next, {
      shouldDirty: true,
      shouldValidate: form.formState.errors.value !== undefined,
    });
  };
  const validate = () => void form.trigger('value');

  const commit = async (value: unknown) => {
    setAlert(null);
    try {
      await save.mutateAsync({
        key: settingKey,
        value,
        ...(branchId === undefined ? {} : { branchId }),
      });
      toast.success(tSettings('toast.saved'));
    } catch (failure) {
      if (!(failure instanceof ApiProblem)) throw failure;
      setAlert(applyProblem(form, failure.problem));
    }
  };
  const submit = form.handleSubmit(async ({ value }) => {
    if (entry.impact_key === null) await commit(value);
    else setPending({ value });
  });

  const required = kind !== 'text';
  const control = () => {
    switch (kind) {
      case 'money':
        return (
          <FormField label={label} required={required} helper={helper} error={error}>
            {(field) => (
              <MoneyInput
                {...field}
                value={(draft as Mmk | undefined) ?? null}
                onChange={set}
                onBlur={validate}
              />
            )}
          </FormField>
        );
      case 'number': {
        const unit = unitKeyOf(settingKey);
        return (
          <FormField label={label} required={required} helper={helper} error={error}>
            {(field) => (
              <div className="flex items-center gap-2">
                <div className="w-32">
                  <TextInput
                    {...field}
                    inputMode={DIGITS}
                    value={(draft as string | undefined) ?? ''}
                    onChange={set}
                    onBlur={validate}
                    data-testid={`${testId}-input`}
                  />
                </div>
                {unit === undefined ? null : <span className="text-sm">{t(unit)}</span>}
              </div>
            )}
          </FormField>
        );
      }
      case 'switch':
        return (
          <FormField label={label} helper={helper} error={error}>
            {(field) => (
              <Switch
                id={field.id}
                aria-labelledby={`${field.id}-label`}
                {...(field['aria-describedby'] === undefined
                  ? {}
                  : { 'aria-describedby': field['aria-describedby'] })}
                checked={draft === true}
                onChange={set}
                data-testid={`${testId}-switch`}
              />
            )}
          </FormField>
        );
      case 'choice':
        return (
          <div className="flex flex-col gap-1.5">
            <ChoiceGroup
              label={label}
              required
              options={choicesOf(settingKey).map((choice) => ({
                value: String(choice),
                label: t(`settings.choice.${settingKey}.${String(choice)}`),
                testId: `${testId}-choice-${String(choice)}`,
              }))}
              value={draft as string | null}
              onChange={set}
              {...(error === undefined ? {} : { error })}
              data-testid={`${testId}-choices`}
            />
            {helper === undefined ? null : (
              <p className="text-sm text-muted-foreground">{helper}</p>
            )}
          </div>
        );
      case 'text':
        return (
          <FormField label={label} helper={helper} error={error}>
            {(field) => (
              <BilingualInput
                {...field}
                value={draft as { mm: string; en: string | null }}
                onChange={set}
                onBlur={validate}
                maxLength={200}
                required={false}
                hint={tSettings('thank_you.helper')}
              />
            )}
          </FormField>
        );
      case 'none':
        return null;
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      data-testid={testId}
      onSubmit={(event) => void submit(event)}
    >
      {alert === null ? null : <FormAlert problem={alert} />}
      {control()}
      <div>
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting || save.isPending}
          data-testid={`${testId}-save`}
        >
          {tSettings('action.save')}
        </Button>
      </div>
      {entry.impact_key === null ? null : (
        <ConfirmDialog
          open={pending !== undefined}
          title={tSettings('impact.title', {
            value:
              pending === undefined
                ? ''
                : formatSettingValue(settingKey, pending.value, { t, ...format }),
          })}
          consequence={t(entry.impact_key)}
          confirmLabel={tSettings('action.save')}
          onConfirm={async () => {
            if (pending !== undefined) await commit(pending.value);
            setPending(undefined);
          }}
          onCancel={() => setPending(undefined)}
        />
      )}
    </form>
  );
}
