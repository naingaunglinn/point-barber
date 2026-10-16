import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { Button } from '../Button/Button';
import { Dialog } from './Dialog';

// ui-foundation "Drawers, sheets and dialogs follow one overlay rule set" (AD-CMP-08 · AD-A11Y-02 ·
// design D10): focus trap, Esc, focus return; centred from 768 px, a bottom sheet below. Positions
// and the 200 ms motion are measured in the browser by the catalogue cases.
const OPEN = 'Open';
const TITLE = 'Send transfer?';
const BODY = 'Point 3.0 → Point 1.0';
const SEND = 'Send transfer';

function Demo({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  return (
    <>
      <Button onClick={() => change(true)}>{OPEN}</Button>
      <Dialog
        open={open}
        onOpenChange={change}
        title={TITLE}
        description={BODY}
        footer={<Button variant="primary">{SEND}</Button>}
      />
    </>
  );
}

const opener = () => screen.getByRole('button', { name: OPEN });

describe('Dialog', () => {
  it('is named by its title and described by its sentence', () => {
    renderIntl(<Demo />);
    fireEvent.click(opener());
    const dialog = screen.getByRole('dialog', { name: TITLE });
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe(BODY);
  });

  it('Scenario: Focus is trapped and returns — Tab wraps inside, and the opener gets the focus back', async () => {
    renderIntl(<Demo />);
    opener().focus();
    fireEvent.click(opener());
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const send = screen.getByRole('button', { name: SEND });
    send.focus();
    fireEvent.keyDown(send, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0)); // Radix returns the focus on the next task
    });
    expect(document.activeElement).toBe(opener());
  });

  it('closes with Esc', () => {
    const onOpenChange = vi.fn();
    renderIntl(<Demo onOpenChange={onOpenChange} />);
    fireEvent.click(opener());
    act(() => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a bottom sheet below 768 px and centred from 768 px, with the overlay motion tokens', () => {
    renderIntl(<Demo />);
    fireEvent.click(opener());
    const classes = screen.getByRole('dialog').className.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining([
        'max-md:bottom-0',
        'max-md:translate-y-0',
        'md:max-w-lg',
        'duration-[var(--motion-overlay)]',
        'data-open:ease-[var(--ease-enter)]',
        'data-closed:ease-[var(--ease-exit)]',
      ]),
    );
  });

  it('can be an alertdialog for a question', () => {
    renderIntl(<Dialog open onOpenChange={() => {}} title={TITLE} role="alertdialog" />);
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBeDefined();
  });
});
