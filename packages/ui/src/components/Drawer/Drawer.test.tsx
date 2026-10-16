import { act, fireEvent, screen } from '@testing-library/react';
import { Component, useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { Button } from '../Button/Button';
import { Dialog } from '../Dialog/Dialog';
import { SECOND_DIALOG_ERROR } from '../Dialog/overlay-stack';
import { clampDrawerWidth, Drawer, Sheet } from './Drawer';

// ui-foundation "Drawers, sheets and dialogs follow one overlay rule set" and "A drawer is addressable
// and guards unsaved edits" (AD-CMP-08 · AD-LAY-02 · AD-LAY-03 · AD-NAV-06 · AD-FORM-08 · AD-VIS-09 ·
// design D10). Rendered widths, the sticky bars while scrolling and the 200 ms are read in the
// browser by the catalogue cases.
const OPEN = 'Open booking';
const TITLE = 'Booking';
const NAME = 'Name';
const SAVE = 'Save';
const BODY = 'Ko Aung · Haircut';

function Demo({
  urlKey,
  width,
  withDialogs = 0,
}: {
  urlKey?: string;
  width?: number;
  withDialogs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <>
      <p>{BODY}</p>
      <Button onClick={() => setOpen(true)}>{OPEN}</Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={TITLE}
        urlKey={urlKey}
        width={width}
        dirty={name !== ''}
        footer={<Button variant="primary">{SAVE}</Button>}
      >
        <input aria-label={NAME} value={name} onChange={(e) => setName(e.target.value)} />
        {Array.from({ length: withDialogs }, (_, i) => (
          <Dialog key={i} open onOpenChange={() => {}} title={`${TITLE} ${i}`} />
        ))}
      </Drawer>
    </>
  );
}

class Boundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

const panel = () => screen.getByRole('dialog', { name: TITLE });
const openDrawer = () => fireEvent.click(screen.getByRole('button', { name: OPEN }));

async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => window.history.replaceState(null, '', '/dev/ui?lang=en'));
afterEach(() => vi.restoreAllMocks());

describe('Drawer', () => {
  it('Scenario: Width limits — 479, 480, 640 and 641 become 480, 480, 640 and 640', () => {
    expect([479, 480, 640, 641].map((w) => clampDrawerWidth(w))).toEqual([480, 480, 640, 640]);
    expect(clampDrawerWidth()).toBe(560);
  });

  it('Scenario: Drawer on desktop and sheet on a phone — a 560 px right panel from 768 px, full screen below', () => {
    renderIntl(<Demo />);
    openDrawer();
    expect(panel().style.getPropertyValue('--drawer-width')).toBe('560px');
    const classes = panel().className.split(' ');
    expect(classes).toEqual(
      expect.arrayContaining([
        'data-[side=right]:inset-0',
        'data-[side=right]:w-full',
        'data-[side=right]:md:w-[var(--drawer-width)]',
        'data-[side=right]:md:left-auto',
      ]),
    );
    // The list beside the panel stays readable: the overlay dims it without a blur.
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    expect(overlay?.className).toContain('bg-foreground/10');
    expect(overlay?.className).not.toContain('blur');
  });

  it('passes the clamped width to the panel', () => {
    renderIntl(<Demo width={700} />);
    openDrawer();
    expect(panel().style.getPropertyValue('--drawer-width')).toBe('640px');
  });

  it('keeps the header and the action bar outside the scrolling body', () => {
    renderIntl(<Demo />);
    openDrawer();
    const body = panel().querySelector('[data-slot="panel-body"]');
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.contains(screen.getByRole('button', { name: SAVE }))).toBe(false);
    expect(
      panel()
        .querySelector('[data-slot="panel-header"]')
        ?.contains(screen.getByRole('button', { name: 'Close' })),
    ).toBe(true);
    expect(
      panel()
        .querySelector('[data-slot="panel-actions"]')
        ?.contains(screen.getByRole('button', { name: SAVE })),
    ).toBe(true);
  });

  it('Scenario: Focus is trapped and returns', async () => {
    renderIntl(<Demo />);
    const opener = screen.getByRole('button', { name: OPEN });
    opener.focus();
    openDrawer();
    expect(panel().contains(document.activeElement)).toBe(true);
    const save = screen.getByRole('button', { name: SAVE });
    save.focus();
    fireEvent.keyDown(save, { key: 'Tab' });
    expect(panel().contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('Scenario: Unsaved changes — Esc after an edit asks "Discard changes?"; untouched, Esc closes', () => {
    renderIntl(<Demo />);
    openDrawer();
    fireEvent.keyDown(panel(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    openDrawer();
    fireEvent.change(screen.getByRole('textbox', { name: NAME }), { target: { value: 'Ma Su' } });
    fireEvent.keyDown(panel(), { key: 'Escape' });
    const question = screen.getByRole('alertdialog', { name: 'Discard changes?' });
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDefined();
    expect(question).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByRole('textbox', { name: NAME }) as HTMLInputElement).value).toBe('Ma Su');

    fireEvent.keyDown(panel(), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull();
  });

  it('Scenario: Address and Back button — ?drawer=booking:demo-1 while open; Back closes, the page stays', async () => {
    renderIntl(<Demo urlKey="booking:demo-1" />);
    openDrawer();
    await tick();
    expect(window.location.search).toBe('?lang=en&drawer=booking:demo-1');
    act(() => window.history.back());
    await tick();
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.search).toBe('?lang=en');
    expect(screen.getByText(BODY)).toBeDefined();
  });

  it('removes the address key when the drawer is closed by its button', async () => {
    renderIntl(<Demo urlKey="booking:demo-1" />);
    openDrawer();
    await tick();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await tick();
    await tick();
    expect(window.location.search).toBe('?lang=en');
  });

  it('Back with unsaved edits keeps the drawer, puts the address back and asks', async () => {
    renderIntl(<Demo urlKey="booking:demo-1" />);
    openDrawer();
    await tick();
    fireEvent.change(screen.getByRole('textbox', { name: NAME }), { target: { value: 'Ma Su' } });
    act(() => window.history.back());
    await tick();
    await tick();
    // The question above it hides the drawer from assistive technology, so it has no name meanwhile.
    expect(screen.getByRole('dialog', { hidden: true }).getAttribute('data-state')).toBe('open');
    expect(screen.getByText(TITLE)).toBeDefined();
    expect(window.location.search).toBe('?lang=en&drawer=booking:demo-1');
    expect(screen.getByRole('alertdialog', { name: 'Discard changes?' })).toBeDefined();
  });

  it('allows one dialog above a drawer', () => {
    renderIntl(<Demo withDialogs={1} />);
    openDrawer();
    expect(screen.getByRole('dialog', { name: `${TITLE} 0` })).toBeDefined();
  });

  it('Scenario: A second dialog over a drawer — an error naming the rule is thrown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const caught: Error[] = [];
    renderIntl(
      <Boundary onError={(error) => caught.push(error)}>
        <Demo withDialogs={2} />
      </Boundary>,
    );
    openDrawer();
    expect(caught.map((error) => error.message)).toContain(SECOND_DIALOG_ERROR);
  });

  it('Scenario: Drawer motion — the overlay motion tokens (200 ms; 0 ms with reduced motion)', () => {
    renderIntl(<Demo />);
    openDrawer();
    expect(panel().className.split(' ')).toEqual(
      expect.arrayContaining([
        'duration-[var(--motion-overlay)]',
        'data-open:ease-[var(--ease-enter)]',
        'data-closed:ease-[var(--ease-exit)]',
      ]),
    );
  });
});

describe('Sheet', () => {
  it('covers the screen, or rises from the bottom', () => {
    const onOpenChange = vi.fn();
    renderIntl(
      <>
        <Sheet open onOpenChange={onOpenChange} title={TITLE}>
          {BODY}
        </Sheet>
      </>,
    );
    expect(screen.getByRole('dialog', { name: TITLE }).getAttribute('data-side')).toBe('right');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('opens from the bottom edge as a bottom sheet', () => {
    renderIntl(
      <Sheet open onOpenChange={() => {}} title={TITLE} side="bottom">
        {BODY}
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: TITLE }).getAttribute('data-side')).toBe('bottom');
  });
});
