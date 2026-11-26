// What the browser can do about installing the app (add-pwa-install design D6 · PW8 · PW9 · AD-PWA-02):
// features are detected, never guessed from the browser's name — nothing in this folder reads the user
// agent (install-capability.test.ts checks it). `beforeinstallprompt` fires early on a page, so one
// listener keeps the event for the guide's *Install* button and for the first-login tip; the store is
// module-level so both read the same event. No service worker, no notification permission (PW6).

/** The part of Chrome's `beforeinstallprompt` event the app uses. */
interface DeferredPrompt {
  prompt(): Promise<void>;
  readonly userChoice: Promise<unknown>;
}

export type PlatformHint = 'android' | 'ios';

export interface InstallCapability {
  /** A deferred install prompt is held — the *Install* button works. */
  readonly canPrompt: boolean;
  /** The section the guide shows first. */
  readonly hint: PlatformHint;
  /** The page runs as the installed app. */
  readonly installed: boolean;
}

/** What the server renders and the first client render shows, so hydration agrees (the Android section first). */
export const SERVER_CAPABILITY: InstallCapability = {
  canPrompt: false,
  hint: 'android',
  installed: false,
};

const isDeferredPrompt = (event: Event): event is Event & DeferredPrompt =>
  'prompt' in event &&
  typeof event.prompt === 'function' &&
  'userChoice' in event &&
  event.userChoice instanceof Promise;

let kept: (Event & DeferredPrompt) | null = null;
let snapshot: InstallCapability | null = null;
const listeners = new Set<() => void>();

/** `navigator.standalone` exists on an iPhone's Safari (false in the browser, true in the installed app). */
const standaloneApi = (): boolean => 'standalone' in navigator;

/** `display-mode: standalone` (Android and desktop) or `navigator.standalone === true` (iPhone). */
export function isInstalled(): boolean {
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return displayMode || ('standalone' in navigator && navigator.standalone === true);
}

/** The guide's first section: Android when a prompt was kept, iPhone when `navigator.standalone` is defined. */
export function platformHint(): PlatformHint {
  if (kept !== null) return 'android';
  return standaloneApi() ? 'ios' : 'android';
}

const read = (): InstallCapability => ({
  canPrompt: kept !== null,
  hint: platformHint(),
  installed: isInstalled(),
});

function emit(): void {
  snapshot = read();
  for (const listener of listeners) listener();
}

/** The capability now (stable between changes, for `useSyncExternalStore`). */
export function getCapability(): InstallCapability {
  snapshot ??= read();
  return snapshot;
}

export function subscribeCapability(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Starts listening to `beforeinstallprompt` and `appinstalled`; the returned function stops and forgets the
 * kept event. Mounted once in the session layer and on the login screen (task 3.2).
 */
export function startInstallCapability(): () => void {
  const onPrompt = (event: Event): void => {
    if (!isDeferredPrompt(event)) return;
    event.preventDefault();
    kept = event;
    emit();
  };
  const onInstalled = (): void => {
    kept = null;
    emit();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  emit();
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
    kept = null;
    emit();
  };
}

/** Opens the browser's own install prompt; after it is accepted or dismissed the event is dropped (PW9). */
export async function promptInstall(): Promise<void> {
  const event = kept;
  if (event === null) return;
  try {
    await event.prompt();
    await event.userChoice;
  } finally {
    kept = null;
    emit();
  }
}
