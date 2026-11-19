import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { Switch } from './Switch';

// add-settings-store task 5.1 — the switch of AD-SET-01 (D-UX-02 · AD-A11Y-02 · AD-A11Y-05): a named
// `role="switch"` with `aria-checked`, toggled by a tap and by the keyboard, inert while disabled. The
// label is the setting `receipt.auto_print` of spec-fixtures (default OFF — REC-37).
const LABEL = 'Print receipts automatically';

function Controlled({
  initial = false,
  disabled = false,
  onChange,
}: {
  readonly initial?: boolean;
  readonly disabled?: boolean;
  readonly onChange?: (checked: boolean) => void;
}) {
  const [checked, setChecked] = useState(initial);
  return (
    <Switch
      aria-label={LABEL}
      checked={checked}
      disabled={disabled}
      data-testid="auto-print"
      onChange={(next) => {
        setChecked(next);
        onChange?.(next);
      }}
    />
  );
}

describe('Switch (add-settings-store task 5.1)', () => {
  it('is a named switch that reports OFF, then ON after a tap', () => {
    const onChange = vi.fn();
    renderIntl(<Controlled onChange={onChange} />);
    const control = screen.getByRole('switch', { name: LABEL });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('auto-print')).toBe(control);
  });

  it('turns OFF again from ON', () => {
    const onChange = vi.fn();
    renderIntl(<Controlled initial onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: LABEL }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('is a native button, so the keyboard reaches it (Space and Enter press it)', () => {
    renderIntl(<Controlled />);
    const control = screen.getByRole('switch', { name: LABEL });
    expect(control.tagName).toBe('BUTTON');
    control.focus();
    expect(document.activeElement).toBe(control);
  });

  it('does nothing while disabled', () => {
    const onChange = vi.fn();
    renderIntl(<Controlled disabled onChange={onChange} />);
    const control = screen.getByRole('switch', { name: LABEL });
    expect((control as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(control);
    expect(onChange).not.toHaveBeenCalled();
    expect(control.getAttribute('aria-checked')).toBe('false');
  });

  it('is labelled by a visible element and marked invalid when asked', () => {
    renderIntl(
      <div>
        <span id="row-label">{LABEL}</span>
        <Switch
          aria-labelledby="row-label"
          aria-invalid
          checked={false}
          onChange={() => undefined}
        />
      </div>,
    );
    const control = screen.getByRole('switch', { name: LABEL });
    expect(control.getAttribute('aria-invalid')).toBe('true');
  });
});
