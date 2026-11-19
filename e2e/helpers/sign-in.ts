import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

import { APP_ORIGIN } from '../hosts.js';
import { mailpit } from './mailpit.js';

// Signing in without the screens (task 8.1): the code request and the verify through the API, with
// the code read from Mailpit, so a spec that is about something else spends one code request and one
// verify per person. The request context keeps the session cookie; `signInAs` hands it to a browser
// context through `storageState`.

/** The headers of a changing request of the staff app (API-AUTH-02). */
export const APP_HEADERS = { 'X-Requested-With': 'point-app', Origin: APP_ORIGIN } as const;

export async function signInWithCode(request: APIRequestContext, email: string): Promise<void> {
  const since = new Date();
  const requested = await request.post('/api/v1/auth/otp/request', {
    headers: APP_HEADERS,
    data: { email },
  });
  if (requested.status() !== 202) throw new Error(`code request answered ${requested.status()}`);
  const code = await mailpit.readCode(email, since);
  const verified = await request.post('/api/v1/auth/otp/verify', {
    headers: APP_HEADERS,
    data: { email, code },
  });
  if (verified.status() !== 200) throw new Error(`verify answered ${verified.status()}`);
}

/** A browser context signed in as the address — one sign-in, reused through storageState. */
export async function signInAs(
  browser: Browser,
  request: APIRequestContext,
  email: string,
  options: { readonly viewport?: { width: number; height: number } } = {},
): Promise<BrowserContext> {
  await signInWithCode(request, email);
  return browser.newContext({
    baseURL: APP_ORIGIN,
    ignoreHTTPSErrors: true,
    storageState: await request.storageState(),
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  });
}
