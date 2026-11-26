// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCapability,
  isInstalled,
  platformHint,
  promptInstall,
  startInstallCapability,
} from './install-capability';

// add-pwa-install task 3.1 · design D6 · PW8 · PW9 · AD-PWA-02. jsdom has neither `navigator.standalone` nor
// `matchMedia`; each test stubs what it needs.
function promptEvent() {
  const prompt = vi.fn(() => Promise.resolve());
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  return { event, prompt };
}

function stubDisplayMode(standalone: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: standalone && query === '(display-mode: standalone)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

let stop: () => void;
beforeEach(() => {
  stop = startInstallCapability();
});
afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'standalone');
});

describe('install capability', () => {
  it('a kept beforeinstallprompt means canPrompt and the Android section first', () => {
    const { event } = promptEvent();
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(getCapability()).toMatchObject({ canPrompt: true, hint: 'android' });
  });

  it('appinstalled drops the prompt', () => {
    window.dispatchEvent(promptEvent().event);
    window.dispatchEvent(new Event('appinstalled'));
    expect(getCapability().canPrompt).toBe(false);
  });

  it('navigator.standalone defined means the iPhone section first', () => {
    Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
    expect(platformHint()).toBe('ios');
  });

  it('Scenario: A laptop sees both, Android first — neither signal gives Android', () => {
    expect(platformHint()).toBe('android');
  });

  it('a kept prompt wins over navigator.standalone', () => {
    Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
    window.dispatchEvent(promptEvent().event);
    expect(platformHint()).toBe('android');
  });

  it('isInstalled follows display-mode: standalone', () => {
    stubDisplayMode(false);
    expect(isInstalled()).toBe(false);
    stubDisplayMode(true);
    expect(isInstalled()).toBe(true);
  });

  it('isInstalled follows navigator.standalone === true, not just its presence', () => {
    stubDisplayMode(false);
    Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
    expect(isInstalled()).toBe(false);
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isInstalled()).toBe(true);
  });

  it('promptInstall opens the browser prompt and drops it after the answer', async () => {
    const { event, prompt } = promptEvent();
    window.dispatchEvent(event);
    await promptInstall();
    expect(prompt).toHaveBeenCalledOnce();
    expect(getCapability().canPrompt).toBe(false);
  });

  it('promptInstall without a kept prompt does nothing', async () => {
    await expect(promptInstall()).resolves.toBeUndefined();
  });

  it('an event without prompt() is ignored', () => {
    window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(getCapability().canPrompt).toBe(false);
  });

  it('stopping forgets the kept prompt and stops listening', () => {
    window.dispatchEvent(promptEvent().event);
    stop();
    expect(getCapability().canPrompt).toBe(false);
    window.dispatchEvent(promptEvent().event);
    expect(getCapability().canPrompt).toBe(false);
    stop = startInstallCapability();
  });
});

// AD-PWA-02 · CG-UI-09: no file of lib/pwa reads the user agent. The pattern is built in pieces so this file
// does not contain the forbidden text itself (tools/guards/check-web-globals.mjs reads test files too).
describe('no user agent in lib/pwa', () => {
  const FORBIDDEN = new RegExp(`navigator\\s*(?:\\.|\\[\\s*['"\`])\\s*user${'Agent'}`);
  const folder = import.meta.dirname;

  it.each(readdirSync(folder).filter((name) => /\.tsx?$/.test(name)))('%s', (name) => {
    expect(readFileSync(join(folder, name), 'utf8')).not.toMatch(FORBIDDEN);
  });
});
