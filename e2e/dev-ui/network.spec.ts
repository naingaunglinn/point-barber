import type { Page, Request } from '@playwright/test';

import { expect, settle, test } from './fixtures.js';
import { CATALOGUE_APP_ORIGIN, CATALOGUE_SITE_ORIGIN } from './origins.js';

// Task 11.18 · AD-IMPL-06 · AD-VIS-05 — runs in my-320, en-320, my-1280 and en-1280.

/** Collects every request the page makes from now on. */
function record(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => requests.push(request));
  return requests;
}

const pathOf = (request: Request) => new URL(request.url()).pathname;

test.describe('add-shared-ui-components · ui-foundation · The catalogue `/dev/ui` exists only outside the production image', () => {
  test('Scenario: Open without a session', async ({ page, openCatalogue }) => {
    const requests = record(page);
    expect(await page.context().cookies()).toEqual([]);
    await openCatalogue(); // answers 200, or the fixture fails
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.map(pathOf).filter((path) => path.startsWith('/api'))).toEqual([]);
  });

  test('Scenario: Not on the public site', async ({ request }) => {
    const response = await request.get(`${CATALOGUE_SITE_ORIGIN}/dev/ui`);
    expect(response.status()).toBe(404);
  });
});

test.describe('add-shared-ui-components · ui-foundation · Fonts are self-hosted WOFF2 files with their licences', () => {
  test('Scenario: No third-party font request', async ({ page, lang, openCatalogue }) => {
    const requests = record(page);
    await openCatalogue({ lang: 'my' });
    await openCatalogue({ lang: 'en' });
    await openCatalogue({ lang });
    const fonts = requests.filter((request) => request.resourceType() === 'font');
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts)
      expect(new URL(font.url()).origin, font.url()).toBe(CATALOGUE_APP_ORIGIN);
    const hosts = requests.map((request) => new URL(request.url()).hostname);
    expect(hosts).not.toContain('fonts.googleapis.com');
    expect(hosts).not.toContain('fonts.gstatic.com');
  });

  test('Scenario: Pyidaungsu is really loaded', async ({ page, lang, openCatalogue }) => {
    test.skip(lang !== 'my' || page.viewportSize()?.width !== 320, 'lang=my at 320 px');
    await openCatalogue();
    await page.locator('#fonts').scrollIntoViewIfNeeded();
    await settle(page);

    const faces = await page.evaluate(() =>
      [...document.fonts]
        .filter((face) => face.family.replaceAll('"', '') === 'Pyidaungsu')
        .map((face) => ({ weight: face.weight, status: face.status })),
    );
    expect(faces).toEqual(
      expect.arrayContaining([
        { weight: '400', status: 'loaded' },
        { weight: '700', status: 'loaded' },
      ]),
    );

    // The glyphs come from Pyidaungsu: each sample is drawn wider or narrower than in system-ui.
    const widthOf = async (testId: string) => (await page.getByTestId(testId).boundingBox())?.width;
    for (const index of [0, 1, 2, 3]) {
      const pyidaungsu = await widthOf(`font-sample-${index}-400`);
      expect(pyidaungsu, `sample ${index}`).toBeGreaterThan(0);
      expect(pyidaungsu, `sample ${index}`).not.toBe(await widthOf(`font-sample-${index}-system`));
    }
    // Scenario: Myanmar digit glyphs stay in the subset.
    expect(await widthOf('digits-pyidaungsu')).not.toBe(await widthOf('digits-system'));
  });
});
