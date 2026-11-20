import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
// `next/link` under the test runner is the pages-router link; it and the app-router link both skip a click that
// is already `defaultPrevented`, which is what the guard relies on (design D3 · R1).
import Link from 'next/link';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../test/intl';
import {
  isUnsavedChangesHeld,
  UnsavedChangesProvider,
  useGuardedRouter,
  useUnsavedChanges,
} from './unsaved-changes';

// ui-foundation "A form reports its unsaved edits to one shared guard", "Navigation links ask …",
// "Opening a link in a new tab never asks", "Programmatic navigation asks unless the form saved first",
// "Back asks before it leaves …", "Closing or reloading the tab …", "The question follows the dialog
// rules" (add-unsaved-changes-guard tasks 1.2 – 1.8 · design D1 – D6 · R1 – R3 · R7). The router is a
// fake over jsdom's own history, so the entries a test builds are the entries the guard sees.
const router = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  back: vi.fn<() => void>(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const QUESTION = 'Discard changes?';
const PHONE = 'Phone';
const PHONE_LABEL = 'Phone number';

function Editor({ label = PHONE }: Readonly<{ label?: string }>) {
  const [value, setValue] = useState('');
  useUnsavedChanges(value !== '');
  return <input aria-label={label} value={value} onChange={(e) => setValue(e.target.value)} />;
}

function Links() {
  return (
    <nav>
      <Link href="/today">Today</Link>
      <Link href="/today?tab=2#top">Today deep</Link>
      <Link href="/settings/company?x=1">Same page</Link>
      <a href="/today" target="_blank">
        New tab
      </a>
      <a href="/today" download>
        Download
      </a>
      <a href="https://example.org/today">External</a>
    </nav>
  );
}

function Leavers() {
  const guarded = useGuardedRouter();
  const [log, setLog] = useState('');
  return (
    <>
      <button onClick={() => guarded.push('/visits/new')}>Start</button>
      <button onClick={() => guarded.replace('/replaced')}>Replace</button>
      <button onClick={() => guarded.back()}>Go back</button>
      <button onClick={() => guarded.leave(() => setLog('left'))}>Leave</button>
      <button onClick={() => guarded.bypass(() => guarded.push('/branches/b4'))}>Saved</button>
      <output>{log}</output>
    </>
  );
}

function Page({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <RouterContext.Provider value={router as unknown as NextRouter}>
      <UnsavedChangesProvider>
        <Editor />
        <Links />
        <Leavers />
        {children}
      </UnsavedChangesProvider>
    </RouterContext.Provider>
  );
}

/** Walks the browser history and resolves when its popstate has been handled. */
function traverse(delta: number): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
    window.history.go(delta);
  });
}

const phone = () => screen.getByRole('textbox', { name: PHONE, hidden: true });
const type = (value: string) => fireEvent.change(phone(), { target: { value } });
const question = () => screen.queryByRole('alertdialog', { name: QUESTION });
const answer = async (name: string) => {
  const dialog = await screen.findByRole('alertdialog', { name: QUESTION });
  fireEvent.click(within(dialog).getByRole('button', { name }));
};

/** History of the scenarios: More, then Settings › Company (the page being edited). */
function startFromMore() {
  window.history.replaceState(null, '', '/more');
  window.history.pushState(null, '', '/settings/company');
}

beforeEach(() => {
  router.push.mockImplementation((href) => window.history.pushState(null, '', href));
  router.replace.mockImplementation((href) => window.history.replaceState(null, '', href));
  router.back.mockImplementation(() => window.history.back());
  startFromMore();
});
afterEach(() => {
  vi.restoreAllMocks();
  router.push.mockReset();
  router.replace.mockReset();
  router.back.mockReset();
});

describe('A form reports its unsaved edits to one shared guard', () => {
  it('holds nothing while clean, holds while dirty, is clean again when typed back', () => {
    renderIntl(<Page />);
    expect(isUnsavedChangesHeld()).toBe(false);
    type('09 400 000 112');
    expect(isUnsavedChangesHeld()).toBe(true);
    type('');
    expect(isUnsavedChangesHeld()).toBe(false);
  });

  it('an unmounted dirty form no longer holds the page', () => {
    const { unmount } = renderIntl(<Page />);
    type('x');
    expect(isUnsavedChangesHeld()).toBe(true);
    unmount();
    expect(isUnsavedChangesHeld()).toBe(false);
  });

  it('two forms, one dirty: the page holds; both clean: it does not', () => {
    renderIntl(
      <Page>
        <Editor label={PHONE_LABEL} />
      </Page>,
    );
    fireEvent.change(screen.getByRole('textbox', { name: PHONE_LABEL }), { target: { value: 'a' } });
    expect(isUnsavedChangesHeld()).toBe(true);
    type('b');
    fireEvent.change(screen.getByRole('textbox', { name: PHONE_LABEL }), { target: { value: '' } });
    expect(isUnsavedChangesHeld()).toBe(true);
    type('');
    expect(isUnsavedChangesHeld()).toBe(false);
  });

  it('without a provider the hook and the router are plain', () => {
    function Bare() {
      useUnsavedChanges(true);
      const guarded = useGuardedRouter();
      return <button onClick={() => guarded.push('/today')}>Go</button>;
    }
    renderIntl(<Bare />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(router.push).toHaveBeenCalledWith('/today');
    expect(question()).toBeNull();
  });
});

describe('Navigation links ask before they leave a page with unsaved edits', () => {
  it('a clean click on a real next/link navigates; a dirty one asks and does not (R1)', async () => {
    renderIntl(<Page />);
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(question()).toBeNull();
    router.push.mockClear();
    startFromMore();
    type('09 400 000 112');
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    expect(router.push).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
    expect(window.location.pathname).toBe('/settings/company');
  });

  it('the question has Keep editing first and the destructive Discard last', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    const dialog = await screen.findByRole('alertdialog', { name: QUESTION });
    const buttons = within(dialog).getAllByRole('button');
    const names = buttons.map((button) => button.textContent);
    expect(names.indexOf('Keep editing')).toBeLessThan(names.indexOf('Discard'));
    expect(within(dialog).queryByText(/./, { selector: 'p' })).toBeNull();
  });

  it('Keep editing closes the question, keeps the value and puts the focus back on the link', async () => {
    renderIntl(<Page />);
    type('09 400 000 112');
    const link = screen.getByRole('link', { name: 'Today' });
    fireEvent.click(link);
    await answer('Keep editing');
    await waitFor(() => expect(question()).toBeNull());
    expect(phone()).toHaveProperty('value', '09 400 000 112');
    expect(window.location.pathname).toBe('/settings/company');
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it('Esc answers Keep editing', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    const dialog = await screen.findByRole('alertdialog', { name: QUESTION });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(question()).toBeNull());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Discard opens the link in place of the guard entry, with path, query and hash', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('link', { name: 'Today deep' }));
    await answer('Discard');
    expect(router.replace).toHaveBeenCalledWith('/today?tab=2#top');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('two quick clicks give one question', async () => {
    renderIntl(<Page />);
    type('x');
    const link = screen.getByRole('link', { name: 'Today' });
    fireEvent.click(link);
    fireEvent.click(link);
    await screen.findByRole('alertdialog', { name: QUESTION });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  });

  it.each([
    ['Ctrl-click', 'Today', { ctrlKey: true }],
    ['⌘-click', 'Today', { metaKey: true }],
    ['Shift-click', 'Today', { shiftKey: true }],
    ['middle button', 'Today', { button: 1 }],
    ['target=_blank', 'New tab', {}],
    ['download', 'Download', {}],
    ['an external address', 'External', {}],
    ['the same path', 'Same page', {}],
  ])('%s does not ask and is left to the browser', (_name, label, init) => {
    renderIntl(<Page />);
    type('x');
    let prevented: boolean | undefined;
    // Registered after the guard's own listener: sees what it did, and keeps jsdom from navigating.
    document.addEventListener(
      'click',
      (event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
      },
      { capture: true, once: true },
    );
    fireEvent.click(screen.getByRole('link', { name: label }), init);
    expect(prevented).toBe(false);
    expect(question()).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
    expect(phone()).toHaveProperty('value', 'x');
  });
});

describe('Programmatic navigation asks unless the form saved first', () => {
  it('push, replace and back navigate at once when clean', () => {
    renderIntl(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(router.push).toHaveBeenCalledWith('/visits/new');
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(router.replace).toHaveBeenCalledWith('/replaced');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(question()).toBeNull();
  });

  it('push asks when dirty and opens only on Discard', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await answer('Keep editing');
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await answer('Discard');
    // The guard entry is the top entry: the navigation takes its place (design D4).
    expect(router.replace).toHaveBeenCalledWith('/visits/new');
    expect(window.location.pathname).toBe('/visits/new');
  });

  it('leave runs its action only on Discard', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await answer('Keep editing');
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await answer('Discard');
    expect(screen.getByRole('status').textContent).toBe('left');
  });

  it('leave runs at once when clean', () => {
    renderIntl(<Page />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.getByRole('status').textContent).toBe('left');
  });

  it('bypass runs at once, without a question, in place of the guard entry (a save that navigates)', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(question()).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/branches/b4');
    expect(router.push).not.toHaveBeenCalled();
    // One Back from the new page shows the page that was left, not a duplicate of it.
    await act(() => traverse(-1));
    expect(window.location.pathname).toBe('/settings/company');
    expect(question()).toBeNull();
  });
});

describe('Back asks before it leaves a page with unsaved edits', () => {
  it('pushes the guard entry once when the page turns dirty', () => {
    const push = vi.spyOn(window.history, 'pushState');
    renderIntl(<Page />);
    type('a');
    type('ab');
    type('abc');
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('takes the entry out again when the page turns clean without leaving', async () => {
    const back = vi.spyOn(window.history, 'back');
    renderIntl(<Page />);
    type('a');
    expect(back).not.toHaveBeenCalled();
    type('');
    expect(back).toHaveBeenCalledTimes(1);
    // That popstate is the guard's own: no question.
    await act(() => new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true })));
    expect(question()).toBeNull();
    expect(window.location.pathname).toBe('/settings/company');
  });

  it('a Back while dirty keeps the page, re-pushes the entry and asks; Keep editing, then Back asks again', async () => {
    const push = vi.spyOn(window.history, 'pushState');
    renderIntl(<Page />);
    type('09 400 000 112');
    await act(() => traverse(-1));
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
    expect(window.location.pathname).toBe('/settings/company');
    expect(phone()).toHaveProperty('value', '09 400 000 112');
    expect(push).toHaveBeenCalledTimes(2);
    await answer('Keep editing');
    await waitFor(() => expect(question()).toBeNull());
    await act(() => traverse(-1));
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
    expect(window.location.pathname).toBe('/settings/company');
  });

  it('Back without edits is not the guard’s', async () => {
    renderIntl(<Page />);
    await act(() => traverse(-1));
    expect(question()).toBeNull();
    expect(window.location.pathname).toBe('/more');
  });

  it('a Back out of a drawer’s address is ignored; the next one asks', async () => {
    renderIntl(<Page />);
    type('x');
    // The drawer's own entry, above the guard entry.
    window.history.pushState(null, '', '/settings/company?drawer=booking:demo-1');
    await act(() => traverse(-1));
    expect(question()).toBeNull();
    expect(window.location.search).toBe('');
    await act(() => traverse(-1));
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
  });

  it('Back, then Discard goes back two entries, to the page the user came from', async () => {
    renderIntl(<Page />);
    type('x');
    await act(() => traverse(-1));
    await screen.findByRole('alertdialog', { name: QUESTION });
    const landed = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    await answer('Discard');
    await act(() => landed);
    expect(window.location.pathname).toBe('/more');
  });

  it('the on-page Go back, then Discard, also lands on the page before', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    const landed = new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }));
    await answer('Discard');
    await act(() => landed);
    expect(window.location.pathname).toBe('/more');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a link Discard to Today, then one Back, shows the company page again', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('link', { name: 'Today' }));
    await answer('Discard');
    expect(window.location.pathname).toBe('/today');
    await act(() => traverse(-1));
    expect(window.location.pathname).toBe('/settings/company');
    expect(question()).toBeNull();
  });
});

describe('Closing or reloading the tab uses the browser’s own question once', () => {
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('is cancelled only while the page holds edits', () => {
    renderIntl(<Page />);
    expect(unload()).toBe(false);
    type('x');
    expect(unload()).toBe(true);
    type('');
    expect(unload()).toBe(false);
  });

  it('is not cancelled after bypass', () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Saved' }));
    expect(unload()).toBe(false);
  });

  it('is not cancelled after Discard on an action that leaves the document', async () => {
    renderIntl(<Page />);
    type('x');
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await answer('Discard');
    expect(unload()).toBe(false);
  });

  it('listens exactly once, however often the page turns dirty', () => {
    const add = vi.spyOn(window, 'addEventListener');
    renderIntl(<Page />);
    type('a');
    type('');
    type('b');
    expect(add.mock.calls.filter(([name]) => name === 'beforeunload')).toHaveLength(1);
  });
});
