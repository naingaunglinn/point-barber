import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { ChoiceGroup, FIRST_ROWS, type ChoiceOption } from './ChoiceGroup';

// ui-foundation "Up to seven options are a radio group, eight or more a searchable combobox" (AD-FORM-14 ·
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
  it('Scenario: Seven options and eight options — a radio group, then a collapsed searchable combobox', async () => {
    const { unmount } = renderIntl(<Controlled count={7} />);
    const group = screen.getByRole('radiogroup', { name: REASON });
    expect(within(group).getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    unmount();

    const onChange = vi.fn();
    renderIntl(<Controlled count={8} onChange={onChange} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    // Collapsed: one trigger named by the label, no text yet, and neither the search field nor an option.
    const trigger = screen.getByRole('combobox', { name: REASON });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.textContent).toBe('');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.queryByPlaceholderText('Search')).toBeNull();

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const popup = screen.getByRole('dialog', { name: REASON });
    expect(trigger.getAttribute('aria-controls')).toBe(popup.id);
    const list = within(popup).getByRole('listbox', { name: REASON });
    expect(within(list).getAllByRole('option')).toHaveLength(8);
    const search = within(popup).getByPlaceholderText('Search');
    expect(search.getAttribute('aria-label')).toBe('Search');
    await waitFor(() => expect(document.activeElement).toBe(search));
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
    // Choosing closes the popover: the options leave the page, the trigger shows the choice and has the focus.
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toBe('Other');
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    // Opened again, the chosen option is highlighted and shows the check icon (`data-checked`).
    fireEvent.click(trigger);
    const chosen = screen.getByRole('option', { name: 'Other' });
    expect(chosen.dataset.checked).toBe('true');
    expect(chosen.getAttribute('aria-selected')).toBe('true');
  });

  it('Scenario: Keyboard in the combobox — ArrowDown opens, Esc closes, ArrowDown and Enter choose; the focus returns to the trigger', async () => {
    const onChange = vi.fn();
    renderIntl(<Controlled count={8} onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: REASON });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const search = screen.getByPlaceholderText('Search');
    await waitFor(() => expect(document.activeElement).toBe(search));
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger.textContent).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    // Enter and Space on the trigger are the button's own click.
    fireEvent.click(trigger);
    const again = screen.getByPlaceholderText('Search');
    await waitFor(() => expect(document.activeElement).toBe(again));
    expect(
      screen
        .getByRole('option', { name: 'Customer wants to change' })
        .getAttribute('aria-selected'),
    ).toBe('true');
    fireEvent.keyDown(again, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Barber မအား' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('reason-2');
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    expect(trigger.textContent).toBe('Barber မအား');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
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

  it('in the combobox, ArrowUp stops at the first option, typing that matches nothing leaves no option, and Enter never reaches a form', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    renderIntl(
      <form onSubmit={onSubmit}>
        <Controlled count={8} onChange={onChange} />
      </form>,
    );
    fireEvent.click(screen.getByRole('combobox', { name: REASON }));
    const search = screen.getByPlaceholderText('Search');
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    const first = screen.getByRole('option', { name: 'Customer wants to change' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(search.getAttribute('aria-activedescendant')).toBe(first.id);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(search.getAttribute('aria-activedescendant')).toBeNull();
    // `false`: the key's default action (a form's implicit submit) was prevented.
    expect(fireEvent.keyDown(search, { key: 'Enter' })).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('Search')).toBe(search);
  });

  it('a long list opens with its first 40 options and shows the rest right after; ArrowDown past them and a chosen option further down show them at once', async () => {
    // Counted with a selector: role queries over 288 options are slow in jsdom.
    const shown = () => document.querySelectorAll('[role="option"]').length;
    const row = (label: string) =>
      within(document.querySelector<HTMLElement>('[role="listbox"]') as HTMLElement)
        .getByText(label)
        .closest('[role="option"]');
    const onChange = vi.fn();
    const { unmount } = renderIntl(<Controlled count={288} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox', { name: REASON }));
    expect(shown()).toBe(FIRST_ROWS);
    await waitFor(() => expect(shown()).toBe(288));
    unmount();

    renderIntl(<Controlled count={288} onChange={onChange} />);
    const trigger = screen.getByRole('combobox', { name: REASON });
    fireEvent.click(trigger);
    const search = screen.getByPlaceholderText('Search');
    for (let step = 0; step < FIRST_ROWS; step += 1)
      fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(shown()).toBe(288);
    expect(row(`Reason ${FIRST_ROWS + 1}`)?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(`reason-${FIRST_ROWS + 1}`);

    // Opened again with that option chosen: every option is there and the chosen one is highlighted.
    fireEvent.click(trigger);
    expect(shown()).toBe(288);
    expect(row(`Reason ${FIRST_ROWS + 1}`)?.getAttribute('aria-selected')).toBe('true');
  });

  it('a required combobox left empty — asterisk, error.required under the trigger, aria-invalid on it', () => {
    renderIntl(
      <ChoiceGroup
        label={REASON}
        required
        error={{ code: 'required' }}
        options={options(8)}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('*').className).toContain('text-destructive');
    const trigger = screen.getByRole('combobox', { name: REASON });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-required')).toBe('true');
    const message = screen.getByText('This field is required.');
    const describedBy = trigger.getAttribute('aria-describedby') ?? '';
    expect(describedBy).not.toBe('');
    expect(message.closest(`[id="${describedBy}"]`)).not.toBeNull();
    // The message is under the trigger, not inside it.
    expect(trigger.contains(message)).toBe(false);
  });

  it('invalidBy marks the combobox invalid by a message outside it, with no message of its own (AD-FORM-02)', () => {
    renderIntl(
      <>
        <ChoiceGroup
          aria-label={REASON}
          invalidBy="outside-error"
          options={options(8)}
          value={null}
          onChange={() => {}}
        />
        <p id="outside-error" />
      </>,
    );
    const trigger = screen.getByRole('combobox', { name: REASON });
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe('outside-error');
    // The group prints no message of its own.
    expect(screen.queryByText('This field is required.')).toBeNull();
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

  it('names the combobox, its popover and its list by aria-label when there is no visible label', () => {
    renderIntl(
      <ChoiceGroup
        aria-label={CANCEL_BOOKING}
        options={options(8)}
        value={null}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByRole('combobox', { name: CANCEL_BOOKING });
    expect(screen.queryByText(CANCEL_BOOKING)).toBeNull();
    fireEvent.click(trigger);
    const popup = screen.getByRole('dialog', { name: CANCEL_BOOKING });
    expect(within(popup).getByRole('listbox', { name: CANCEL_BOOKING })).toBeDefined();
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

  it('the radio form puts the group test id on its wrapper', () => {
    renderIntl(
      <ChoiceGroup
        label={REASON}
        data-testid="choice"
        options={options(4)}
        value={null}
        onChange={() => {}}
      />,
    );
    expect(within(screen.getByTestId('choice')).getByRole('radiogroup')).toBeDefined();
  });

  it('Scenario: Test ids of the combobox form — the group test id on the trigger, the options only once it is opened', () => {
    renderIntl(
      <ChoiceGroup
        label={REASON}
        data-testid="choice"
        options={options(8).map((option) => ({ ...option, testId: `choice-${option.value}` }))}
        value={null}
        onChange={() => {}}
      />,
    );
    const trigger = screen.getByTestId('choice');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(document.querySelector('[data-testid^="choice-reason-"]')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByTestId('choice-reason-8').getAttribute('role')).toBe('option');
  });
});
