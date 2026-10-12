import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { catalogueCode, ErrorCode, normalizePhone, type Problem } from '@point/shared';

import { Button } from '../components/Button/Button';
import { FormField } from '../components/FormField/FormField';
import { Input } from '../primitives/input';
import { renderIntl } from '../test/intl';
import { FormAlert } from './FormAlert';
import { applyProblem, fieldErrorOf, registerField, useAppForm } from './use-app-form';

// ui-foundation "Forms validate on blur and submit, stay submittable, and map server errors to
// fields" (AD-FORM-03 · AD-FORM-04 · API-ERR-01 · API-ERR-03 · CG-UI-06 · design D9).

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .refine(
      (text) => normalizePhone(text) !== 'phone_invalid',
      catalogueCode(ErrorCode.PHONE_INVALID),
    ),
  amount: z.string().optional(),
});

const LABELS = { name: 'Name', phone: 'Phone', amount: 'Amount', save: 'Save' } as const;

const REQUEST_ID = '0192a5c4-7e1f-7b3a-9c2d-3e4f5a6b7c8d';
const problem = (code: string, errors?: Problem['errors']): Problem => ({
  title: code,
  status: errors ? 400 : 403,
  code,
  request_id: REQUEST_ID,
  ...(errors ? { errors } : {}),
});

/** The form demo of the spec: Name (required), Phone (required), Amount (optional). */
function Demo({ answer }: { answer?: () => Problem | null }) {
  const form = useAppForm(schema, { defaultValues: { name: '', phone: '', amount: '' } });
  const submit = form.handleSubmit(async () => {
    const result = answer?.() ?? null;
    if (result) {
      const unplaced = applyProblem(form, result);
      if (unplaced)
        form.setError('root.server', { type: unplaced.code, message: JSON.stringify(unplaced) });
    }
  });
  const root = form.formState.errors.root?.server;
  const alert = root?.message ? (JSON.parse(root.message) as Problem) : null;
  return (
    <form onSubmit={submit} noValidate>
      {alert ? <FormAlert problem={alert} /> : null}
      {(['name', 'phone', 'amount'] as const).map((name) => (
        <FormField
          key={name}
          label={LABELS[name]}
          required={name !== 'amount'}
          error={fieldErrorOf(form.formState.errors, name)}
        >
          {(control) => <Input {...control} {...registerField(form, name)} />}
        </FormField>
      ))}
      <Button type="submit" variant="primary">
        {LABELS.save}
      </Button>
    </form>
  );
}

const field = (name: keyof typeof LABELS) => screen.getByRole('textbox', { name: LABELS[name] });
const messageOf = (input: HTMLElement) =>
  document.getElementById(input.getAttribute('aria-describedby')?.split(' ')[0] ?? '')?.textContent;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('form binding', () => {
  it('validates on blur: an empty required field shows error.required', async () => {
    renderIntl(<Demo />);
    fireEvent.focus(field('name'));
    fireEvent.blur(field('name'));
    await flush();
    expect(field('name').getAttribute('aria-invalid')).toBe('true');
    expect(messageOf(field('name'))).toBe('This field is required.');
  });

  it('does not validate while typing before the field has shown an error', async () => {
    renderIntl(<Demo />);
    fireEvent.change(field('phone'), { target: { value: '0977' } });
    await flush();
    expect(field('phone').hasAttribute('aria-invalid')).toBe(false);
  });

  it('Scenario: The error clears while typing — after the first character', async () => {
    renderIntl(<Demo />);
    fireEvent.blur(field('name'));
    await flush();
    expect(messageOf(field('name'))).toBe('This field is required.');
    fireEvent.change(field('name'), { target: { value: 'M' } });
    await flush();
    expect(field('name').hasAttribute('aria-invalid')).toBe(false);
    expect(field('name').getAttribute('aria-describedby')).toBeNull();
  });

  it('Scenario: Submit with two invalid fields — both messages, focus in Name, the button stays enabled', async () => {
    renderIntl(<Demo />);
    const save = screen.getByRole('button', { name: LABELS.save });
    expect(save).toHaveProperty('disabled', false);
    fireEvent.change(field('phone'), { target: { value: '0977' } });
    fireEvent.submit(save.closest('form') as HTMLFormElement);
    await flush();
    expect(messageOf(field('name'))).toBe('This field is required.');
    expect(messageOf(field('phone'))).toBe('Enter a valid phone number.');
    expect(document.activeElement).toBe(field('name'));
    expect(save).toHaveProperty('disabled', false);
  });

  it('Scenario: Server error on a field and without a field — under Phone, then an inline alert, no toast', async () => {
    let answer: Problem = problem('validation', [{ field: 'phone', code: 'phone_invalid' }]);
    renderIntl(<Demo answer={() => answer} />);
    fireEvent.change(field('name'), { target: { value: 'Ma Su' } });
    fireEvent.change(field('phone'), { target: { value: '09 7712 3456' } });
    fireEvent.submit(field('name').closest('form') as HTMLFormElement);
    await flush();
    expect(messageOf(field('phone'))).toBe('Enter a valid phone number.');
    expect(screen.queryByRole('alert')).toBeNull();

    answer = problem('forbidden');
    fireEvent.submit(field('name').closest('form') as HTMLFormElement);
    await flush();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(
      "You don't have access to this page. Ask an admin if you need it.",
    );
    expect(
      alert.compareDocumentPosition(field('name')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.querySelector('[data-sonner-toaster]')).toBeNull();
  });

  it('Scenario: Generic field codes with their bound — too_big with maximum 100', async () => {
    renderIntl(
      <Demo
        answer={() =>
          problem('validation', [{ field: 'name', code: 'too_big', params: { maximum: 100 } }])
        }
      />,
    );
    fireEvent.change(field('name'), { target: { value: 'Ma Su' } });
    fireEvent.change(field('phone'), { target: { value: '09 7712 3456' } });
    fireEvent.submit(field('name').closest('form') as HTMLFormElement);
    await flush();
    expect(messageOf(field('name'))).toBe('This value is too long or too large — maximum 100.');
  });

  it('Scenario: An empty required text from the server — too_small with minimum 1 shows error.required', () => {
    const setError = vi.fn();
    applyProblem(
      { setError, getValues: () => '' } as never,
      problem('validation', [{ field: 'name', code: 'too_small', params: { minimum: 1 } }]),
    );
    expect(setError).toHaveBeenCalledWith(
      'name',
      { type: 'required', message: '{}' },
      { shouldFocus: true },
    );
  });

  it('Scenario: A value below its minimum and a wrong type — too_small {minimum 2} for M, invalid_type on Amount', async () => {
    let answer = problem('validation', [
      { field: 'name', code: 'too_small', params: { minimum: 2 } },
    ]);
    renderIntl(<Demo answer={() => answer} />);
    fireEvent.change(field('name'), { target: { value: 'M' } });
    fireEvent.change(field('phone'), { target: { value: '09 7712 3456' } });
    fireEvent.submit(field('name').closest('form') as HTMLFormElement);
    await flush();
    expect(messageOf(field('name'))).toBe('This value is too short or too small — minimum 2.');
    answer = problem('validation', [{ field: 'amount', code: 'invalid_type' }]);
    fireEvent.change(field('name'), { target: { value: 'Ma Su' } });
    fireEvent.submit(field('name').closest('form') as HTMLFormElement);
    await flush();
    expect(messageOf(field('amount'))).toBe('This value has the wrong format.');
  });

  it('maps an array position of the server field to the form name', () => {
    const setError = vi.fn();
    applyProblem(
      { setError, getValues: () => 'x' } as never,
      problem('validation', [{ field: 'lines[1].qty', code: 'too_big', params: { maximum: 9 } }]),
    );
    expect(setError).toHaveBeenCalledWith(
      'lines.1.qty',
      { type: 'too_big', message: '{"maximum":9}' },
      { shouldFocus: true },
    );
  });

  it('returns a problem without field errors for the inline alert, and null otherwise', () => {
    const form = { setError: vi.fn(), getValues: () => '' } as never;
    expect(applyProblem(form, problem('forbidden'))?.code).toBe('forbidden');
    expect(
      applyProblem(form, problem('validation', [{ field: 'name', code: 'too_big' }])),
    ).toBeNull();
  });

  it('the inline alert of an internal error shows the short error ID', () => {
    renderIntl(<FormAlert problem={problem('internal_error')} />);
    expect(screen.getByRole('alert').textContent).toContain('Error ID: 0192a5c4');
  });
});
