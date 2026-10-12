import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { Button } from '../Button/Button';
import {
  ReasonDialog,
  type MasterReason,
  type ReasonResult,
  type ReasonSource,
} from './ReasonDialog';

// ui-foundation "Every reason-required action uses ReasonDialog with its reason source" (AD-RSN-01 ·
// AD-RSN-02 · API-DATA-11 · AD-FORM-14 · D-BKG-14 · D-VIS-13 · design D10). The cancel reasons are the
// DB Part 3 seed of spec-fixtures.md §8.
const CANCEL_REASONS: readonly MasterReason[] = [
  {
    id: 'r1',
    name_mm: 'Customer ပြောင်းချင်',
    name_en: 'Customer wants to change',
    requires_note: false,
  },
  { id: 'r2', name_mm: 'Barber မအား', name_en: null, requires_note: false },
  { id: 'r3', name_mm: 'Customer မလာ', name_en: null, requires_note: false },
  { id: 'r4', name_mm: 'Other', name_en: null, requires_note: true },
];
const LATE_ENTRY: ReasonSource = {
  type: 'preset',
  options: [
    { code: 1, name: 'INTERNET_OUTAGE', requiresNote: false },
    { code: 2, name: 'POWER_OUTAGE', requiresNote: false },
    { code: 3, name: 'PHONE_BROKEN', requiresNote: false },
    { code: 4, name: 'FORGOT', requiresNote: false },
    { code: 9, name: 'OTHER', requiresNote: true },
  ],
};
const OPEN = 'Open';
const TITLE = 'Cancel booking';
const CONSEQUENCE =
  "Ma Su's booking of 05/Oct/2026 2:30 PM with Ko Aung at Point 3.0 is cancelled.";

function Demo({
  source,
  note,
  onConfirm,
  onCancel,
}: {
  source: ReasonSource;
  note?: 'none' | 'optional' | 'by-reason' | 'required';
  onConfirm: (result: ReasonResult) => void;
  onCancel?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormatProvider locale="en" profile="app">
      <Button onClick={() => setOpen(true)}>{OPEN}</Button>
      <ReasonDialog
        open={open}
        title={TITLE}
        consequence={CONSEQUENCE}
        source={source}
        note={note}
        confirmLabel={TITLE}
        destructive
        onConfirm={(result) => {
          onConfirm(result);
          setOpen(false);
        }}
        onCancel={() => {
          onCancel?.();
          setOpen(false);
        }}
      />
    </FormatProvider>
  );
}

const open = () => fireEvent.click(screen.getByRole('button', { name: OPEN }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: TITLE }));
const required = () => screen.queryByText('Enter a reason.');

describe('ReasonDialog', () => {
  it('shows the title, the consequence, the verb and Keep', () => {
    renderIntl(<Demo source={{ type: 'master', options: CANCEL_REASONS }} onConfirm={() => {}} />);
    open();
    const dialog = screen.getByRole('alertdialog', { name: TITLE });
    expect(dialog.textContent).toContain(CONSEQUENCE);
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDefined();
    expect(screen.getByRole('button', { name: TITLE }).dataset.variant).toBe('destructive');
  });

  it('Scenario: Master reason without a note — { reason_id, note: null } and the dialog closes', () => {
    const onConfirm = vi.fn();
    renderIntl(
      <Demo
        source={{ type: 'master', options: CANCEL_REASONS }}
        note="optional"
        onConfirm={onConfirm}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Customer wants to change' }));
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ reason_id: 'r1', note: null });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Scenario: Master reason that requires a note — error under the note, then { reason_id, note }', () => {
    const onConfirm = vi.fn();
    renderIntl(
      <Demo
        source={{ type: 'master', options: CANCEL_REASONS }}
        note="optional"
        onConfirm={onConfirm}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    confirm();
    expect(onConfirm).not.toHaveBeenCalled();
    const note = screen.getByRole('textbox', { name: 'Other' });
    expect(note.getAttribute('aria-describedby')).toContain(required()?.id);
    expect(screen.getByRole('alertdialog')).toBeDefined();
    fireEvent.change(note, { target: { value: 'wrong phone' } });
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ reason_id: 'r4', note: 'wrong phone' });
  });

  it('asks for a reason when none is chosen', () => {
    const onConfirm = vi.fn();
    renderIntl(<Demo source={{ type: 'master', options: CANCEL_REASONS }} onConfirm={onConfirm} />);
    open();
    confirm();
    expect(required()).not.toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Scenario: Preset reasons of a late entry — five radios; POWER_OUTAGE → { reason_code: 2 }; OTHER needs a note', () => {
    const onConfirm = vi.fn();
    renderIntl(<Demo source={LATE_ENTRY} onConfirm={onConfirm} />);
    open();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Internet outage',
      'Power outage',
      'Phone broken',
      'Forgot',
      'Other',
    ]);
    fireEvent.click(screen.getByRole('radio', { name: 'Other' }));
    confirm();
    expect(required()).not.toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Power outage' }));
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ reason_code: 2 });
  });

  it('Scenario: Free-text reason — empty is refused, then { note: "Customer charged twice" }', () => {
    const onConfirm = vi.fn();
    renderIntl(<Demo source={{ type: 'free' }} onConfirm={onConfirm} />);
    open();
    confirm();
    expect(required()).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: TITLE }), {
      target: { value: 'Customer charged twice' },
    });
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ note: 'Customer charged twice' });
  });

  it('Scenario: Seven reasons and eight reasons — a radio group, then a searchable list', () => {
    const reasons = (n: number): MasterReason[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `m${i}`,
        name_mm: `Reason ${i + 1}`,
        name_en: null,
        requires_note: false,
      }));
    const { unmount } = renderIntl(
      <Demo source={{ type: 'master', options: reasons(7) }} onConfirm={() => {}} />,
    );
    open();
    expect(screen.getAllByRole('radio')).toHaveLength(7);
    expect(screen.queryByRole('listbox')).toBeNull();
    unmount();
    const onConfirm = vi.fn();
    renderIntl(<Demo source={{ type: 'master', options: reasons(8) }} onConfirm={onConfirm} />);
    open();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByRole('listbox')).toBeDefined();
    expect(screen.getByPlaceholderText('Search')).toBeDefined();
    fireEvent.click(screen.getByText('Reason 8'));
    confirm();
    expect(onConfirm).toHaveBeenCalledWith({ reason_id: 'm7' });
  });

  it('Scenario: Keeping the record — Keep or Esc closes, nothing is returned, focus back on the opener', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderIntl(<Demo source={LATE_ENTRY} onConfirm={onConfirm} onCancel={onCancel} />);
    const opener = screen.getByRole('button', { name: OPEN });
    opener.focus();
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(opener);
    open();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });
});
