import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { PhoneInput, type PhoneValue } from './PhoneInput';

// ui-foundation "PhoneInput keeps what was typed and previews the formatted number" (AD-FORM-10 ·
// FE-CMP-06 · D-CUS-02 · AD-FMT-10 · design D10).
const LABEL = 'Phone';

function Demo({
  onValue,
  onComplete,
}: {
  onValue?: (v: PhoneValue) => void;
  onComplete?: (e164: string) => void;
}) {
  const [raw, setRaw] = useState('');
  return (
    <PhoneInput
      aria-label={LABEL}
      value={raw}
      onChange={(next) => {
        setRaw(next.raw);
        onValue?.(next);
      }}
      onComplete={onComplete}
    />
  );
}

const field = () => screen.getByRole('textbox', { name: LABEL }) as HTMLInputElement;
const typeAll = (text: string) => {
  for (let i = 1; i <= text.length; i += 1)
    fireEvent.change(field(), { target: { value: text.slice(0, i) } });
};
const preview = () => document.querySelector('[data-slot="phone-preview"]')?.textContent ?? null;

describe('PhoneInput', () => {
  it('is a tel keypad field with the placeholder 09 xxx xxx xxx', () => {
    renderIntl(<Demo />);
    expect(field().getAttribute('inputmode')).toBe('tel');
    expect(field().getAttribute('placeholder')).toBe('09 xxx xxx xxx');
  });

  it('Scenario: Typing Myanmar digits — field and preview 09 7712 3456, e164 +95977123456', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    typeAll('၀၉ ၇၇၁၂ ၃၄၅၆');
    expect(field().value).toBe('09 7712 3456');
    expect(preview()).toBe('09 7712 3456');
    expect(onValue).toHaveBeenLastCalledWith({ raw: '09 7712 3456', e164: '+95977123456' });
  });

  it('Scenario: The typed form is kept — +95977123456 stays, the preview groups it', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    typeAll('+95977123456');
    expect(field().value).toBe('+95977123456');
    expect(preview()).toBe('09 7712 3456');
    expect(onValue).toHaveBeenLastCalledWith({ raw: '+95977123456', e164: '+95977123456' });
  });

  it('reports e164 null and shows no preview until the number is valid', () => {
    const onValue = vi.fn();
    renderIntl(<Demo onValue={onValue} />);
    typeAll('0977');
    expect(onValue).toHaveBeenLastCalledWith({ raw: '0977', e164: null });
    expect(preview()).toBeNull();
  });

  it('Scenario: Incomplete number on blur — error.phone_invalid under the field', () => {
    renderIntl(<Demo />);
    typeAll('0977');
    expect(screen.queryByText('Enter a valid phone number.')).toBeNull();
    fireEvent.blur(field());
    const message = screen.getByText('Enter a valid phone number.');
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(field().getAttribute('aria-describedby')).toContain(message.id);
  });

  it('shows no message on blur for an empty field (required is the form’s rule)', () => {
    renderIntl(<Demo />);
    fireEvent.blur(field());
    expect(screen.queryByText('Enter a valid phone number.')).toBeNull();
  });

  it('calls onComplete once per valid number, when typing pauses or the field is left', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    renderIntl(<Demo onComplete={onComplete} />);
    typeAll('09 7712 3456'); // valid from 7 digits on: no call while typing
    expect(onComplete).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('+95977123456');
    fireEvent.change(field(), { target: { value: '09 7712 3456 ' } }); // the same number
    act(() => vi.advanceTimersByTime(500));
    fireEvent.blur(field());
    expect(onComplete).toHaveBeenCalledTimes(1);
    fireEvent.change(field(), { target: { value: '09 4500 1122' } });
    fireEvent.blur(field()); // leaving the field completes at once
    expect(onComplete).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenLastCalledWith('+95945001122');
    vi.useRealTimers();
  });
});
