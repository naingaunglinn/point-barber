import { describe, expect, it } from 'vitest';

import { loadMessages } from '@point/i18n';

import fixture from '../../test/fixtures/pwa-colours.json';
import { staffManifest } from './manifest';

// add-pwa-install task 1.2 · spec "The staff host serves a web app manifest without a session" · PW2 · PW3 · PW4.
describe('staffManifest', () => {
  const manifest = staffManifest(loadMessages('my'), fixture.colours.white.hex);

  it('starts at the start page, in the staff scope, as a standalone app', () => {
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    expect(manifest).not.toHaveProperty('orientation');
  });

  it('takes its names from the language files', () => {
    expect(manifest.name).toBe('Point Barbershop');
    expect(manifest.short_name).toBe('Point');
  });

  it('has the same names in English (PW4)', () => {
    const en = staffManifest(loadMessages('en'), fixture.colours.white.hex);
    expect([en.name, en.short_name]).toEqual([manifest.name, manifest.short_name]);
  });

  it('colours the bar and the splash with the colour it is given', () => {
    expect(manifest.theme_color).toBe(fixture.colours.white.hex);
    expect(manifest.background_color).toBe(fixture.colours.white.hex);
  });

  it('lists the three icons with their sizes and purposes (the Apple icon is linked by the pages)', () => {
    expect(manifest.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ]);
  });
});
