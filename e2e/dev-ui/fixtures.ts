import { test as base, type Page } from '@playwright/test';

// Fixtures of the catalogue specs: the project's language and an optional wrong device date, and
// `openCatalogue`, which opens `/dev/ui` with them and waits until the page has settled.

export type Lang = 'my' | 'en';

export interface CatalogueOptions {
  readonly lang: Lang;
  /** Sets the device clock (the zone project): the catalogue must not read it. */
  readonly deviceDate: string | undefined;
}

type Params = Readonly<Record<string, string>>;

interface CatalogueFixtures {
  /** Opens `/dev/ui` in the project's language; `params` adds or overrides query parameters. */
  readonly openCatalogue: (params?: Params) => Promise<void>;
}

/** The address of the catalogue with the given query parameters. */
export function catalogueUrl(lang: Lang, params: Params = {}): string {
  return `/dev/ui?${new URLSearchParams({ lang, ...params }).toString()}`;
}

/** Waits for hydration, network quiet and the web fonts, so measurements see the final layout. */
export async function settle(page: Page): Promise<void> {
  // Set by the page in its first layout effect (apps/web …/dev/ui/html-attributes.tsx): before it, the
  // server HTML still carries the cookie's language and the staff tree.
  await page.locator('html[data-catalogue-ready]').waitFor({ state: 'attached' });
  // The page has no polling and calls no API, so network quiet means the demos have loaded.
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Runs in the page before its scripts: the device clock reads `target` and runs on from there. Not
 * Playwright's `page.clock` — its Date stand-in builds plain dates, so a subclass of Date (`TZDate` of
 * @date-fns/tz) loses its methods there, which a phone with a wrong date never does. Here the
 * constructor builds with `new.target`, so subclasses keep working; timers are untouched.
 */
function shiftDeviceClock(target: number): void {
  const NativeDate = Date;
  const offset = target - NativeDate.now();
  const now = () => NativeDate.now() + offset;
  function DeviceDate(this: unknown, ...args: unknown[]): unknown {
    if (new.target === undefined) return new NativeDate(now()).toString();
    return Reflect.construct(NativeDate, args.length === 0 ? [now()] : args, new.target);
  }
  Object.setPrototypeOf(DeviceDate, NativeDate);
  Object.defineProperty(DeviceDate, 'prototype', { value: NativeDate.prototype });
  Object.defineProperty(DeviceDate, 'now', { value: now });
  globalThis.Date = DeviceDate as unknown as DateConstructor;
}

export const test = base.extend<CatalogueOptions & CatalogueFixtures>({
  lang: ['en', { option: true }],
  deviceDate: [undefined, { option: true }],
  page: async ({ page, deviceDate }, use) => {
    if (deviceDate !== undefined)
      await page.addInitScript(shiftDeviceClock, Date.parse(deviceDate));
    await use(page);
  },
  openCatalogue: async ({ page, lang }, use) => {
    await use(async (params = {}) => {
      const response = await page.goto(catalogueUrl(lang, params));
      if (response?.status() !== 200) throw new Error(`/dev/ui answered ${response?.status()}`);
      await settle(page);
    });
  },
});

export { expect } from '@playwright/test';
