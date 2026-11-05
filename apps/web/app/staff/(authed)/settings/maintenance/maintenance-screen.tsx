'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

import {
  type MaintenanceBody,
  type Problem,
  type SystemStatus,
  businessDateOf,
  catalogueCode,
  maintenanceBodySchema,
  mmtInstant,
  mmtTimeOfDay,
} from '@point/shared';
import {
  BilingualInput,
  Button,
  ErrorState,
  FormAlert,
  FormField,
  PageHeader,
  Skeleton,
  Switch,
  applyProblem,
  fieldErrorOf,
  toast,
  useAppForm,
} from '@point/ui';

import { UntilField } from '../../../../../components/settings/maintenance/UntilField';
import { ApiProblem } from '../../../../../lib/api/client';
import { screenProblem } from '../../../../../lib/pos/problem';
import { useCan } from '../../../../../lib/session/grants';
import { RefusedPage } from '../../../../../lib/session/main-query-state';
import { useSetMaintenance, useSystemStatus } from '../../../../../lib/settings/queries';

// Settings › Maintenance mode (AD-NAV-08 · D-PLT-08 · P1.SYS.03 · owner SS2 · design D10 · task 6.1): the
// switch, an optional expected end (date and time) and optional Myanmar and English messages of at most
// 200 characters, sent with `PUT /v1/system/maintenance` and checked first by the API's body schema; a
// toast for ON and for OFF. Only for company-scope settings.update; anyone else gets the no-access page and
// nothing is loaded. A failed load in the background (window focus) keeps the form and what was typed; a
// Save that gets no answer (no network) shows the error inline. The page title is the screen's name
// (WCAG 2.4.2).

const REQUIRED = catalogueCode('required').error;

/** The form: the switch, the two parts of the expected end, the message pair. */
const formSchema = z
  .object({
    enabled: z.boolean(),
    until_date: z.string().nullable(),
    until_time: z.string().nullable(),
    message: z.object({ mm: z.string(), en: z.string().nullable() }),
  })
  .superRefine((form, ctx) => {
    // OFF sends only `{ enabled: false }`, so the expected end and the messages are not checked then.
    if (!form.enabled) return;
    // One part of the expected end without the other: ask for the missing one.
    if (form.until_date !== null && form.until_time === null)
      ctx.addIssue({ code: 'custom', path: ['until'], message: REQUIRED });
    if (form.until_date === null && form.until_time !== null)
      ctx.addIssue({ code: 'custom', path: ['until'], message: REQUIRED });
  })
  // OFF ends the window: the expected end and the messages go with it (P1.SYS.03 "Turn it off").
  .transform((form): MaintenanceBody =>
    form.enabled
      ? {
          enabled: true,
          until:
            form.until_date !== null && form.until_time !== null
              ? mmtInstant(form.until_date, form.until_time)
              : null,
          message_mm: form.message.mm,
          message_en: form.message.en,
        }
      : { enabled: false },
  )
  .pipe(maintenanceBodySchema);

type FormInput = z.input<typeof formSchema>;

function defaultsOf(status: SystemStatus): FormInput {
  return {
    enabled: status.maintenance,
    until_date: status.until === null ? null : businessDateOf(status.until),
    until_time: status.until === null ? null : mmtTimeOfDay(status.until),
    message: { mm: status.message_mm ?? '', en: status.message_en },
  };
}

function MaintenanceForm({ status }: Readonly<{ status: SystemStatus }>) {
  const t = useTranslations('maintenance.screen');
  const tNav = useTranslations('settings.nav');
  const tAction = useTranslations('settings.action');
  const form = useAppForm(formSchema, { defaultValues: defaultsOf(status) });
  const save = useSetMaintenance();
  const [alert, setAlert] = useState<Pick<Problem, 'code' | 'request_id'> | null>(null);
  const values = form.watch();
  const until = fieldErrorOf(form.formState.errors, 'until');
  const message =
    fieldErrorOf(form.formState.errors, 'message_mm') ??
    fieldErrorOf(form.formState.errors, 'message_en');
  const submit = form.handleSubmit(async (body) => {
    setAlert(null);
    try {
      const answer = await save.mutateAsync(body.enabled ? body : { enabled: false });
      toast.success(answer.maintenance ? t('saved_on') : t('saved_off'));
    } catch (failure) {
      // No answer at all (no network) is not an ApiProblem: the alert says so (CG-ERR-01).
      setAlert(
        failure instanceof ApiProblem
          ? applyProblem(form, failure.problem)
          : screenProblem(failure),
      );
    }
  });
  const set = <K extends keyof FormInput>(name: K, value: FormInput[K]) =>
    form.setValue(name, value as never, { shouldDirty: true });
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      data-testid="maintenance-form"
      onSubmit={(event) => void submit(event)}
    >
      {alert === null ? null : <FormAlert problem={alert} />}
      <FormField label={tNav('maintenance')}>
        {(field) => (
          <Switch
            id={field.id}
            aria-labelledby={`${field.id}-label`}
            checked={values.enabled}
            onChange={(next) => set('enabled', next)}
            data-testid="maintenance-switch"
          />
        )}
      </FormField>
      <UntilField
        date={values.until_date}
        time={values.until_time}
        onDate={(next) => set('until_date', next)}
        onTime={(next) => set('until_time', next)}
        {...(until === undefined ? {} : { error: until })}
      />
      <FormField label={t('message')} {...(message === undefined ? {} : { error: message })}>
        {(field) => (
          <BilingualInput
            {...field}
            value={values.message}
            onChange={(next) => set('message', next)}
            maxLength={200}
            required={false}
            hint={t('message_help')}
          />
        )}
      </FormField>
      <div>
        <Button
          type="submit"
          variant="primary"
          loading={form.formState.isSubmitting || save.isPending}
          data-testid="maintenance-save"
        >
          {tAction('save')}
        </Button>
      </div>
    </form>
  );
}

export function MaintenanceScreen() {
  const tNav = useTranslations('settings.nav');
  const t = useTranslations('maintenance.screen');
  const can = useCan();
  const allowed = can('settings.update', { level: 'company' });
  const status = useSystemStatus(allowed);
  if (!allowed) return <RefusedPage code="forbidden" />;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4" data-testid="maintenance-screen">
      <title>{tNav('maintenance')}</title>
      <PageHeader title={tNav('maintenance')} />
      <p>{t('intro')}</p>
      {status.data === undefined ? (
        status.isError ? (
          <ErrorState problem={screenProblem(status.error)} onRetry={() => status.refetch()} />
        ) : (
          <div aria-busy="true">
            <Skeleton shape="text" />
          </div>
        )
      ) : (
        <MaintenanceForm
          // The form shows the stored values: after a save (an OFF clears the expected end and the
          // messages) or another admin's change it starts again from them.
          key={JSON.stringify([
            status.data.maintenance,
            status.data.until,
            status.data.message_mm,
            status.data.message_en,
          ])}
          status={status.data}
        />
      )}
    </div>
  );
}
