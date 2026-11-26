import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import Link from 'next/link';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../test/intl';
import { UnsavedChangesProvider, useGuardedRouter, useUnsavedChanges } from './unsaved-changes';

// "Back asks before it leaves a page with unsaved edits", the form as the first entry of its tab (a link
// opened in a new tab, UG1, or a deep link): there is no earlier entry for *Discard* to go back to
// (add-unsaved-changes-guard design D4, review of #89). Its own file, so the jsdom history starts with the
// page itself and nothing before it.
const router = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  back: vi.fn<() => void>(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const QUESTION = 'Discard changes?';
const PHONE = 'Phone';
const GO_BACK = 'Go back';
const TODAY = 'Today';

function Editor() {
  const [value, setValue] = useState('');
  useUnsavedChanges(value !== '');
  return <input aria-label={PHONE} value={value} onChange={(e) => setValue(e.target.value)} />;
}

function Back() {
  const guarded = useGuardedRouter();
  return <button onClick={() => guarded.back()}>{GO_BACK}</button>;
}

function Page() {
  return (
    <RouterContext.Provider value={router as unknown as NextRouter}>
      <UnsavedChangesProvider>
        <Editor />
        <Back />
        <Link href="/today">{TODAY}</Link>
      </UnsavedChangesProvider>
    </RouterContext.Provider>
  );
}

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

beforeEach(() => {
  // The test's only history entry is the page.
  window.history.replaceState(null, '', '/settings/company');
  router.push.mockImplementation((href) => window.history.pushState(null, '', href));
  router.replace.mockImplementation((href) => window.history.replaceState(null, '', href));
  router.back.mockImplementation(() => window.history.back());
});

/** Lets the guard's wait for a page before this one run out (nothing came, so nothing was left). */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));

describe('The form is the first entry of its tab', () => {
  it('Back, then Discard has nowhere to go: the page and the edits stay and the guard asks again', async () => {
    renderIntl(<Page />);
    type('09 400 000 112');
    await act(() => traverse(-1));
    await answer('Discard');
    await waitFor(() => expect(question()).toBeNull());
    await settle();
    expect(window.location.pathname).toBe('/settings/company');
    expect(phone()).toHaveProperty('value', '09 400 000 112');
    // The edits are still there, so Back asks again, ...
    await act(() => traverse(-1));
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
    expect(window.location.pathname).toBe('/settings/company');
    await answer('Keep editing');
    await waitFor(() => expect(question()).toBeNull());
    // ... and so does the on-page Go back, whose Discard has nowhere to go either, ...
    fireEvent.click(screen.getByRole('button', { name: GO_BACK }));
    await answer('Discard');
    await waitFor(() => expect(question()).toBeNull());
    await settle();
    expect(phone()).toHaveProperty('value', '09 400 000 112');
    // ... and a link, and closing the tab.
    fireEvent.click(screen.getByRole('link', { name: TODAY }));
    expect(await screen.findByRole('alertdialog', { name: QUESTION })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
});
