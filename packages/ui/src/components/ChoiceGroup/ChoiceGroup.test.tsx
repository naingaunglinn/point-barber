import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';

// ui-foundation "Up to seven options are a radio group, eight or more a searchable list" (AD-FORM-14 ·
// AD-A11Y-02 · AD-A11Y-04 · AD-A11Y-05 · AD-VIS-07 · D-UI-01 · design D10). The first four options are
// the booking cancel reasons of spec-fixtures.md §8 in `en` (a reason without an English name shows its
// Myanmar one); the payment methods are the CASH / KBZPAY rows of the base seed (§9).
const SEED: readonly ChoiceOption[] = [
  { value: 'reason-1', label: 'Customer wants to change' },
  { value: 'reason-2', label: 'Barber မအား' },
  { value: 'reason-3', label: 'Customer မလာ' },
  { value: 'reason-4', label: 'Other' },
];
const options = (count: number): readonly ChoiceOption[] => [
  ...SEED.slice(0, count),
  ...Array.from({ length: Math.max(0, count - SEED.length) }, (_, index) => ({
    value: `reason-${SEED.length + index + 1}`,
    label: `Reason ${SEED.length + index + 1}`,
  })),
];
const REASON = 'Reason';
const CANCEL_BOOKING = 'Cancel booking';

function Controlled({
  count,
  onChange,
}: {
  readonly count: number;
  readonly onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState<string | null>(null);
  return (
    <ChoiceGroup
      label={REASON}
      options={options(count)}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('ChoiceGroup', () => {
  it('Scenario: Seven options and eight options — a radio group, then a searchable list', async () => {
    const { unmount } = renderIntl(<Controlled count={7} />);
    const group = screen.getByRole('radiogroup', { name: REASON });
    expect(within(group).getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    unmount();

    const onChange = vi.fn();
    renderIntl(<Controlled count={8} onChange={onChange} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    const list = screen.getByRole('listbox', { name: REASON });
    expect(within(list).getAllByRole('option')).toHaveLength(8);
    const search = screen.getByPlaceholderText('Search');
    expect(search.getAttribute('aria-label')).toBe('Search');
    fireEvent.change(search, { target: { value: 'Other' } });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Other']),
    );
    fireEvent.click(within(list).getByRole('option', { name: 'Other' }));
    expect(onChange).toHaveBeenCalledWith('reason-4');
    // The chosen option shows the check icon (cmdk's own aria-selected follows the keyboard highlight).
    expect(within(list).getByRole('option', { name: 'Other' }).dataset.checked).toBe('true');
  });

  it('Scenario: Keyboard in the radio group — one tab stop, ArrowDown chooses the next option', async () => {
    const onChange = vi.fn();
    renderIntl(<Controlled count={7} onChange={onChange} />);
    const radios = screen.getAllByRole('radio');
    // Nothing chosen: the group is one tab stop that enters on the first option (Radix roving focus).
    radios[0]?.focus();
    expect(document.activeElement).toBe(radios[0]);
    expect(radios[0]?.getAttribute('aria-checked')).toBe('false');
    fireEvent.keyDown(radios[0] as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('reason-2'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('reason-3'));
    const chosen = screen.getByRole('radio', { name: 'Customer မလာ' });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(chosen);
    // The chosen option is the group's only tab stop, so the next Tab leaves the group.
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('tabindex'))).toEqual([
      '-1',
      '-1',
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ]);
  });

  it('Scenario: The label text is part of the target — pressing "Other" chooses it; rows 44 px, 8 px apart', () => {
    const onChange = vi.fn();
    renderIntl(<Controlled count={7} onChange={onChange} />);
    fireEvent.click(screen.getByText('Other'));
    expect(onChange).toHaveBeenCalledWith('reason-4');
    const row = screen.getByText('Other').closest('label');
    expect(row?.className).toContain('min-h-11');
    expect(screen.getByRole('radiogroup').className).toContain('gap-2');
  });

  it('marks Myanmar option text with lang="my" (DataText)', () => {
    renderIntl(<Controlled count={4} />);
    expect(screen.getByText('Barber မအား').closest('[lang="my"]')).not.toBeNull();
    expect(screen.getByText('Other').closest('[lang="my"]')).toBeNull();
  });

  it('Scenario: A required choice left empty — asterisk, error.required under the options, aria-invalid', () => {
    renderIntl(
      <ChoiceGroup
        label={REASON}
        required
        error={{ code: 'required' }}
        options={options(4)}
        value={null}
        onChange={() => {}}
      />,
    );
    const mark = screen.getByText('*');
    expect(mark.className).toContain('text-destructive');
    const group = screen.getByRole('radiogroup', { name: REASON });
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-required')).toBe('true');
    const message = screen.getByText('This field is required.');
    const describedBy = group.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(message.closest(`[id="${describedBy}"]`)).not.toBeNull();
  });

  it('an optional group without an error has no asterisk and no message', () => {
    renderIntl(<Controlled count={4} />);
    expect(screen.queryByText('*')).toBeNull();
    const group = screen.getByRole('radiogroup', { name: REASON });
    expect(group.getAttribute('aria-invalid')).toBeNull();
    expect(group.getAttribute('aria-describedby')).toBeNull();
  });

  it('is named by aria-label where a visible title already names it — no visible label', () => {
    renderIntl(
      <ChoiceGroup
        aria-label={CANCEL_BOOKING}
        options={options(4)}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: CANCEL_BOOKING })).toBeDefined();
    expect(screen.queryByText(CANCEL_BOOKING)).toBeNull();
  });

  it('Scenario: Test ids reach the element with the role — payment-method-<code> on the radio', () => {
    const onChange = vi.fn();
    renderIntl(
      <ChoiceGroup
        label="Method"
        options={[
          { value: 'id-cash', label: 'Cash', testId: 'payment-method-CASH' },
          { value: 'id-kbzpay', label: 'KBZPay', testId: 'payment-method-KBZPAY' },
        ]}
        value="id-cash"
        onChange={onChange}
      />,
    );
    const kbz = screen.getByTestId('payment-method-KBZPAY');
    expect(kbz.getAttribute('role')).toBe('radio');
    expect(kbz).toBe(screen.getByRole('radio', { name: 'KBZPay' }));
    expect(screen.getByTestId('payment-method-CASH').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(kbz);
    expect(onChange).toHaveBeenCalledWith('id-kbzpay');
  });

  it('puts an option test id on the option element of the list form', () => {
    renderIntl(
      <ChoiceGroup
        label={REASON}
        options={options(8).map((option) => ({ ...option, testId: `choice-${option.value}` }))}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId('choice-reason-8').getAttribute('role')).toBe('option');
  });
});
