'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

import { catalogueCode, ErrorCode, normalizePhone, type Problem } from '@point/shared';

import { Button } from '../../components/Button/Button';
import { FormField } from '../../components/FormField/FormField';
import { FormAlert } from '../../forms/FormAlert';
import { applyProblem, fieldErrorOf, registerField, useAppForm } from '../../forms/use-app-form';
import { Input } from '../../primitives/input';
import { HandlerLog } from '../demo-frame';

// Buttons and forms demos (task 9.2 · AD-CMP-01 · AD-FORM-01..05 · API-ERR-01 · API-ERR-03 · design D9 /
// D12): the four variants, an icon-only button, a button blocked with its reason, the loading button that
// counts its calls, and the form: "Save" validates on the client; the answer buttons apply a server answer
// (`errors[]` or a problem without a field) to the form as it is.

export function ButtonVariantsDemo() {
  const t = useTranslations('devui.buttons');
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Button variant="primary">{t('save')}</Button>
      <Button variant="secondary">{t('export')}</Button>
      <Button variant="ghost" icon={<Plus />}>
        {t('add')}
      </Button>
      <Button variant="destructive" icon={<Trash2 />}>
        {t('delete')}
      </Button>
      <Button variant="ghost" iconOnly icon={<Pencil />} aria-label={t('edit')} />
      <Button variant="primary" disabledReason={t('closedReason')}>
        {t('reopen')}
      </Button>
    </div>
  );
}

/** A request that takes 1.5 s; a second tap while it runs does not call it again. */
const SLOW_MS = 1500;

export function ButtonLoadingDemo() {
  const t = useTranslations('devui.buttons');
  const [calls, setCalls] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="primary"
          onClick={() => {
            setCalls((count) => count + 1);
            return new Promise((resolve) => setTimeout(resolve, SLOW_MS));
          }}
        >
          {t('save')}
        </Button>
      </div>
      <p className="text-sm" data-testid="call-count">
        {t('calls', { count: calls })}
      </p>
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .refine(
      (text) => normalizePhone(text) !== 'phone_invalid',
      catalogueCode(ErrorCode.PHONE_INVALID),
    ),
  amount: z.string().optional(),
  note: z.string().optional(),
});

type Answer =
  'phone_invalid' | 'forbidden' | 'too_big' | 'too_small_1' | 'too_small_2' | 'invalid_type';

const ANSWERS: readonly Answer[] = [
  'phone_invalid',
  'forbidden',
  'too_big',
  'too_small_1',
  'too_small_2',
  'invalid_type',
];

/** A fixed request id for the demo problems (no request is made). */
const REQUEST_ID = '0192a5c4-7e1f-7b3a-9c2d-3e4f5a6b7c8d';

function problemOf(answer: Answer): Problem {
  const problem = (code: string, errors?: Problem['errors']): Problem => ({
    title: code,
    status: errors ? 400 : 403,
    code,
    request_id: REQUEST_ID,
    ...(errors ? { errors } : {}),
  });
  switch (answer) {
    case 'phone_invalid':
      return problem('validation', [{ field: 'phone', code: 'phone_invalid' }]);
    case 'forbidden':
      return problem('forbidden');
    case 'too_big':
      return problem('validation', [{ field: 'name', code: 'too_big', params: { maximum: 100 } }]);
    case 'too_small_1':
      return problem('validation', [{ field: 'name', code: 'too_small', params: { minimum: 1 } }]);
    case 'too_small_2':
      return problem('validation', [{ field: 'name', code: 'too_small', params: { minimum: 2 } }]);
    case 'invalid_type':
      return problem('validation', [{ field: 'amount', code: 'invalid_type' }]);
  }
}

export function FormDemo() {
  const t = useTranslations('devui.form');
  const log = useTranslations('devui.log');
  const [result, setResult] = useState('');
  const form = useAppForm(schema, {
    defaultValues: { name: '', phone: '', amount: '', note: '' },
  });
  const submit = form.handleSubmit(() => {
    form.clearErrors('root.server');
    setResult(log('submitted'));
  });
  // A server answer is applied to the form as it is now, as if the last submit had returned it.
  const answerWith = (answer: Answer) => {
    form.clearErrors();
    const problem = problemOf(answer);
    const unplaced = applyProblem(form, problem);
    if (unplaced)
      form.setError('root.server', { type: unplaced.code, message: JSON.stringify(unplaced) });
    setResult(log('problem', { code: problem.code }));
  };
  const root = form.formState.errors.root?.server;
  const alert = root?.message ? (JSON.parse(root.message) as Problem) : null;
  const fields = [
    { name: 'name', label: t('name'), required: true },
    { name: 'phone', label: t('phone'), required: true },
    { name: 'amount', label: t('amount'), required: false },
    { name: 'note', label: t('note'), required: false },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-sm font-semibold">{t('serverAnswer')}</legend>
        {ANSWERS.map((value) => (
          <Button key={value} variant="secondary" onClick={() => answerWith(value)}>
            {t(`answer.${value}`)}
          </Button>
        ))}
      </fieldset>
      <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-3">
        {alert ? <FormAlert problem={alert} /> : null}
        {fields.map(({ name, label, required }) => (
          <FormField
            key={name}
            label={label}
            required={required}
            error={fieldErrorOf(form.formState.errors, name)}
          >
            {(control) => (
              <Input
                {...control}
                {...registerField(form, name)}
                className="h-12 text-base md:h-10"
              />
            )}
          </FormField>
        ))}
        <div>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
            {t('submit')}
          </Button>
        </div>
      </form>
      <HandlerLog label={log('label')} value={result} />
    </div>
  );
}
