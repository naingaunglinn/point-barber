import { act, fireEvent, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FormatProvider } from '../../providers/format';
import { renderIntl } from '../../test/intl';
import { Button } from '../Button/Button';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog';
import { ReasonDialog } from '../ReasonDialog/ReasonDialog';
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

/**
 * The `max-w-*` class that sets the panel's width at a viewport width. jsdom has no media queries, so
 * this follows the order in which Tailwind 4 emits the rules — the last that applies wins: unscoped,
 * `max-md:` (< 768 px), `sm:` (≥ 640 px), `md:` (≥ 768 px). A width class with any other variant fails.
 */
const WIDTH_VARIANTS: readonly (readonly [string, (px: number) => boolean])[] = [
  ['', () => true],
  ['max-md:', (px) => px < 768],
  ['sm:', (px) => px >= 640],
  ['md:', (px) => px >= 768],
];
function widthAt(classes: readonly string[], px: number): string | undefined {
  const widths = classes.filter((name) => /(^|:)max-w-/.test(name));
  for (const name of widths) {
    const variant = name.slice(0, name.lastIndexOf('max-w-'));
    expect(WIDTH_VARIANTS.map(([prefix]) => prefix)).toContain(variant);
  }
  let width: string | undefined;
  for (const [prefix, applies] of WIDTH_VARIANTS) {
    const own = widths.filter((name) => name.slice(0, name.lastIndexOf('max-w-')) === prefix);
    if (applies(px) && own.length > 0) width = own.at(-1)?.slice(prefix.length);
  }
  return width;
}

const SHEET_WIDTHS = [320, 360, 639, 640, 700, 767] as const;

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

  it.each<[string, ReactElement]>([
    ['Dialog', <Dialog key="d" open onOpenChange={() => {}} title={TITLE} />],
    [
      'ConfirmDialog',
      <ConfirmDialog
        key="c"
        open
        title={SEND}
        consequence={BODY}
        confirmLabel={SEND}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    ],
    [
      'ReasonDialog',
      <FormatProvider key="r" locale="en" profile="app">
        <ReasonDialog
          open
          title={SEND}
          consequence={BODY}
          source={{ type: 'preset', options: [{ code: 1, name: 'FORGOT', requiresNote: false }] }}
          confirmLabel={SEND}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      </FormatProvider>,
    ],
  ])(
    '%s: the bottom sheet spans the screen at every width below 768 px, centred with max-w-lg from 768 px',
    (_name, element) => {
      renderIntl(element);
      const panel = document.querySelector('[data-slot="dialog-content"]');
      const classes = (panel?.className ?? '').split(' ');
      for (const px of SHEET_WIDTHS) expect([px, widthAt(classes, px)]).toEqual([px, 'max-w-none']);
      expect(widthAt(classes, 768)).toBe('max-w-lg');
      expect(widthAt(classes, 1280)).toBe('max-w-lg');
    },
  );

  it('can be an alertdialog for a question', () => {
    renderIntl(<Dialog open onOpenChange={() => {}} title={TITLE} role="alertdialog" />);
    expect(screen.getByRole('alertdialog', { name: TITLE })).toBeDefined();
  });
});
