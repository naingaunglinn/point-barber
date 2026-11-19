import { type APIRequestContext, type BrowserContext, test as base } from '@playwright/test';

import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';

// One request context per host, so a spec says which host it calls: `site.get('/api/v1/health')`
// goes to the public host, `app.get(…)` to the staff host. Pages use the configured baseURL (the
// staff host) or a full URL.
//
// Every page of the `context` / `page` fixtures records the browser's `securitypolicyviolation`
// events, and the test fails on any (add-staging-deploy design D8 · CG-SEC-12): the screens run
// under the content-security policy that Caddy sends.
interface Hosts {
  readonly site: APIRequestContext;
  readonly app: APIRequestContext;
}

export interface PolicyViolation {
  readonly directive: string;
  readonly blocked: string;
  readonly page: string;
}

interface Policy {
  /** The violations recorded so far in this test's context. */
  readonly policyViolations: PolicyViolation[];
}

// A string, not a function: the e2e workspace is compiled without the DOM library.
const RECORD_VIOLATIONS = `
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__pointPolicyViolation({
      directive: event.effectiveDirective,
      blocked: event.blockedURI,
      page: document.location.href,
    });
  });
`;

/**
 * Records the policy violations of every page of `context` into `into` — for a context a spec opens
 * itself (signInAs); the fixture's own context is recorded already.
 */
export async function recordPolicyViolations(
  context: BrowserContext,
  into: PolicyViolation[],
): Promise<void> {
  await context.exposeFunction('__pointPolicyViolation', (violation: PolicyViolation) => {
    into.push(violation);
  });
  await context.addInitScript({ content: RECORD_VIOLATIONS });
}

export const test = base.extend<Hosts & Policy>({
  site: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: SITE_ORIGIN,
      ignoreHTTPSErrors: true,
    });
    await use(context);
    await context.dispose();
  },
  app: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: APP_ORIGIN,
      ignoreHTTPSErrors: true,
    });
    await use(context);
    await context.dispose();
  },
  policyViolations: async ({}, use) => {
    await use([]);
  },
  context: async ({ context, policyViolations }, use) => {
    await recordPolicyViolations(context, policyViolations);
    await use(context);
    base.expect(policyViolations, 'securitypolicyviolation events').toStrictEqual([]);
  },
});

export { expect } from '@playwright/test';
