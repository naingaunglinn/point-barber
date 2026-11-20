'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '../components/Button/Button';
import { Dialog } from '../components/Dialog/Dialog';

// The one unsaved-changes guard of the signed-in staff area (add-unsaved-changes-guard design D1 – D6 ·
// AD-FORM-08 · AD-NAV-06 · AD-IMPL-02). A form calls `useUnsavedChanges(dirty)`; while any registered form
// is dirty the page "holds unsaved edits" and every way of leaving it asks "Discard changes?" first:
// a link (one capture-phase click listener, D3), programmatic navigation (`useGuardedRouter`), the
// browser's Back (one guard entry in the history, D4) and Sign out (`leave`). Closing or reloading the tab
// keeps the browser's own question (one `beforeunload` listener, D5). A lost session and a save that
// navigates go through `bypass`, which disarms the guard (D6). Outside the provider (the login screen,
// the catalogue) every hook is a no-op or the plain router.

/** The router a form leaves through (design D1). */
export interface GuardedRouter {
  /** Asks first while the page holds unsaved edits, then opens `href`. */
  push(href: string): void;
  replace(href: string): void;
  /** Asks first, then goes back to the page before the one being edited. */
  back(): void;
  /** Runs `action` at once when the page is clean, otherwise only after *Discard*. */
  leave(action: () => void): void;
  /** Runs `action` at once with the guard disarmed (a navigation after a save, a lost session). */
  bypass(action: () => void): void;
}

interface Guard {
  readonly report: (id: string, dirty: boolean) => void;
  readonly forget: (id: string) => void;
  readonly router: GuardedRouter;
}

interface Question {
  /** What *Discard* does. */
  readonly run: () => void;
}

/** Mutable state of one provider; read by its listeners, never rendered. */
interface Live {
  held: boolean;
  /** *Discard* or `bypass` ran: nothing asks until a form turns dirty again. */
  disarmed: boolean;
  /** The address of the guard's own history entry (design D4); `null` when there is none. */
  entry: string | null;
  /** Popstates the guard caused itself and ignores. */
  skipPops: number;
  /** The address of the history entry the user is on, to tell a drawer's Back from the page's. */
  here: string;
  question: Question | null;
}

const GuardContext = createContext<Guard | null>(null);

// For the session layer (design D1): true while any registered form is dirty.
let anyHeld = false;

/** True while any form of the page holds unsaved edits. */
export function isUnsavedChangesHeld(): boolean {
  return anyHeld;
}

const DRAWER_PARAM = 'drawer';

function carriesDrawer(href: string): boolean {
  return new URL(href).searchParams.has(DRAWER_PARAM);
}

/** A plain left-click on an in-app link that opens another page; anything else is the browser's. */
function pageLinkOf(event: MouseEvent): URL | null {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return null;
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  // A new tab or window closes nothing (UG1).
  if ((anchor.target !== '' && anchor.target !== '_self') || anchor.hasAttribute('download'))
    return null;
  const url = new URL(anchor.href, window.location.href);
  // An external address (ADR-009) and the same page (UG5: the query and the hash are not a page) pass.
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname)
    return null;
  return url;
}

export function UnsavedChangesProvider({ children }: Readonly<{ children: ReactNode }>) {
  const t = useTranslations('common');
  const nextRouter = useRouter();
  const [question, setQuestion] = useState<Question | null>(null);
  const [holds, setHolds] = useState(false);
  const dirtyOf = useRef(new Map<string, boolean>());
  const live = useRef<Live>({
    held: false,
    disarmed: false,
    entry: null,
    skipPops: 0,
    here: '',
    question: null,
  });

  const controls = useMemo(() => {
    const state = live.current;
    const ask = (run: () => void) => {
      if (state.question !== null) return;
      state.question = { run };
      setQuestion(state.question);
    };
    const close = () => {
      state.question = null;
      setQuestion(null);
    };
    // The guard's entry is the top entry and a copy of the page: a navigation takes its place, so one
    // Back from the new page returns to the page that was left (design D4).
    const open = (href: string) => {
      const over = state.entry !== null;
      state.entry = null;
      if (over) nextRouter.replace(href);
      else nextRouter.push(href);
    };
    // Past the guard entry and the page itself, to the page the user came from.
    const goBack = () => {
      if (state.entry === null) {
        nextRouter.back();
        return;
      }
      state.entry = null;
      window.history.go(-2);
    };
    const bypass = (action: () => void) => {
      state.disarmed = true;
      action();
    };
    const decide = (action: () => void) => (state.held && !state.disarmed ? ask(action) : action());
    const router: GuardedRouter = {
      push: (href) => decide(() => open(href)),
      replace: (href) =>
        decide(() => {
          state.entry = null;
          nextRouter.replace(href);
        }),
      back: () => decide(goBack),
      leave: (action) => decide(() => bypass(action)),
      bypass,
    };
    const sync = () => {
      state.held = [...dirtyOf.current.values()].some((dirty) => dirty);
      anyHeld = state.held;
      setHolds(state.held);
    };
    return {
      ask,
      close,
      open,
      goBack,
      guard: {
        report: (id: string, dirty: boolean) => {
          dirtyOf.current.set(id, dirty);
          sync();
        },
        forget: (id: string) => {
          dirtyOf.current.delete(id);
          sync();
        },
        router,
      } satisfies Guard,
    };
  }, [nextRouter]);

  // The guard's history entry: pushed once when the page turns dirty, taken out again when it turns clean
  // without leaving (design D4). A form that unmounts because of a navigation finds the entry replaced.
  useEffect(() => {
    const state = live.current;
    if (holds) {
      state.disarmed = false;
      if (state.entry === null) {
        window.history.pushState(window.history.state, '', window.location.href);
        state.entry = window.location.href;
      }
      return;
    }
    if (state.entry === null) return;
    const entry = state.entry;
    state.entry = null;
    if (window.location.href !== entry) return;
    state.skipPops += 1;
    window.history.back();
  }, [holds]);

  // Links, Back and the tab: one listener each, for the life of the provider.
  useEffect(() => {
    const state = live.current;
    state.here = window.location.href;

    const onClick = (event: MouseEvent) => {
      if (!state.held || state.disarmed || event.defaultPrevented) return;
      const url = pageLinkOf(event);
      if (url === null) return;
      // Next's `Link` skips its own navigation for a prevented click (risk R1).
      event.preventDefault();
      // The control gets the focus back when the question closes, also where a click does not focus.
      if (event.target instanceof Element) event.target.closest('a')?.focus();
      controls.ask(() => controls.open(`${url.pathname}${url.search}${url.hash}`));
    };

    const onPopState = () => {
      const previous = state.here;
      state.here = window.location.href;
      if (state.skipPops > 0) {
        state.skipPops -= 1;
        return;
      }
      if (!state.held || state.disarmed || state.entry === null) return;
      // Back out of a drawer's address is the drawer's (AD-NAV-06).
      if (carriesDrawer(previous) && !carriesDrawer(window.location.href)) return;
      // A jump to another page through the history menu is not the guard's entry.
      if (new URL(state.entry).pathname !== window.location.pathname) {
        state.entry = null;
        return;
      }
      // Back left the guard entry and landed on the page: put the entry back and ask.
      window.history.pushState(window.history.state, '', window.location.href);
      state.entry = window.location.href;
      controls.ask(controls.goBack);
    };

    // Every pushState / replaceState moves `here`, so a popstate knows the address it came from.
    const { pushState, replaceState } = window.history;
    const follow =
      (original: History['pushState']): History['pushState'] =>
      (data, unused, url) => {
        original.call(window.history, data, unused, url);
        state.here = window.location.href;
      };
    const pushed = follow(pushState);
    const replaced = follow(replaceState);
    window.history.pushState = pushed;
    window.history.replaceState = replaced;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!state.held || state.disarmed) return;
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (window.history.pushState === pushed) window.history.pushState = pushState;
      if (window.history.replaceState === replaced) window.history.replaceState = replaceState;
    };
  }, [controls]);

  const answer = (discard: boolean) => {
    const asked = question;
    controls.close();
    if (!discard || asked === null) return;
    live.current.disarmed = true;
    asked.run();
  };

  return (
    <GuardContext value={controls.guard}>
      {children}
      <Dialog
        open={question !== null}
        onOpenChange={(open) => {
          if (!open) answer(false);
        }}
        role="alertdialog"
        title={t('form.discard.title')}
        footer={
          <>
            <Button data-testid="unsaved-keep-editing" onClick={() => answer(false)}>
              {t('action.keepEditing')}
            </Button>
            <Button variant="destructive" data-testid="unsaved-discard" onClick={() => answer(true)}>
              {t('action.discard')}
            </Button>
          </>
        }
      />
    </GuardContext>
  );
}

/**
 * Registers the calling form with the guard while it is mounted; `dirty` is the form library's own flag
 * (`formState.isDirty`), so a value typed back to the loaded one is clean again. No-op outside a provider.
 */
export function useUnsavedChanges(dirty: boolean): void {
  const guard = useContext(GuardContext);
  const id = useId();
  useEffect(() => guard?.report(id, dirty), [guard, id, dirty]);
  useEffect(() => () => guard?.forget(id), [guard, id]);
}

/** The router of the signed-in area: `push` / `replace` / `back` ask first while edits are unsaved. */
export function useGuardedRouter(): GuardedRouter {
  const router = useRouter();
  const guard = useContext(GuardContext);
  return useMemo(
    () =>
      guard?.router ?? {
        push: (href) => router.push(href),
        replace: (href) => router.replace(href),
        back: () => router.back(),
        leave: (action) => action(),
        bypass: (action) => action(),
      },
    [guard, router],
  );
}
