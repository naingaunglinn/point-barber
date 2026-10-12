import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Input } from '../../primitives/input';
import { renderIntl } from '../../test/intl';
import { FormField } from './FormField';

// ui-foundation "Form fields show the required asterisk and the error under the field" (D-UI-01 ·
// AD-FORM-01 · AD-FORM-02 · AD-FORM-05 · AD-A11Y-04 · design D10).
const NAME = 'Name';
const NOTE = 'Note';
const HELPER = 'As on the ID card';

describe('FormField', () => {
  it('puts the label above the control and links them', () => {
    renderIntl(<FormField label={NAME}>{(control) => <Input {...control} />}</FormField>);
    const input = screen.getByRole('textbox', { name: NAME });
    const label = screen.getByText(NAME);
    expect(label.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Scenario: Asterisk only on required fields', () => {
    renderIntl(
      <>
        <FormField label={NAME} required>
          {(control) => <Input {...control} />}
        </FormField>
        <FormField label={NOTE}>{(control) => <Input {...control} />}</FormField>
      </>,
    );
    const asterisks = document.querySelectorAll('[data-slot="required-mark"]');
    expect(asterisks).toHaveLength(1);
    expect(asterisks[0]?.textContent).toBe('*');
    expect(asterisks[0]?.className).toContain('text-destructive');
    expect(asterisks[0]?.previousSibling?.textContent).toBe(NAME);
    expect(screen.getByRole('textbox', { name: NAME }).getAttribute('aria-required')).toBe('true');
    expect(screen.getByRole('textbox', { name: NOTE }).hasAttribute('aria-required')).toBe(false);
  });

  it('Scenario: Required field left empty — the message under the field, aria-invalid and aria-describedby', () => {
    renderIntl(
      <FormField label={NAME} required error={{ code: 'required' }}>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: NAME });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(
      input.getAttribute('aria-describedby')?.split(' ')[0] ?? '',
    );
    expect(message?.textContent).toBe('This field is required.');
    expect(message?.className).toContain('text-destructive');
    expect(input.nextElementSibling).toBe(message);
  });

  it('shows a field code with its params in the UI language', () => {
    renderIntl(
      <FormField label={NAME} error={{ code: 'too_big', params: { maximum: 100 } }}>
        {(control) => <Input {...control} />}
      </FormField>,
      { locale: 'my' },
    );
    expect(screen.getByText('ရှည်လွန်း / များလွန်းပါတယ် — အများဆုံး 100။')).toBeDefined();
  });

  it('shows error.unknown for a code without a key', () => {
    renderIntl(
      <FormField label={NAME} error={{ code: 'something_new' }}>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(screen.getByText('Something went wrong. Try again.')).toBeDefined();
  });

  it('describes the control by its helper text too, and has no aria-invalid without an error', () => {
    renderIntl(
      <FormField label={NAME} helper={HELPER}>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: NAME });
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      HELPER,
    );
  });
});
