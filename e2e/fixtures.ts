import { type APIRequestContext, test as base } from '@playwright/test';

import { APP_ORIGIN, SITE_ORIGIN } from './hosts.js';

// One request context per host, so a spec says which host it calls: `site.get('/api/v1/health')`
// goes to the public host, `app.get(…)` to the staff host. Pages use the configured baseURL (the
// staff host) or a full URL.
interface Hosts {
  readonly site: APIRequestContext;
  readonly app: APIRequestContext;
}

export const test = base.extend<Hosts>({
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
});

export { expect } from '@playwright/test';
