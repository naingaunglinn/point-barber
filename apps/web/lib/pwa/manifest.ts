import type { Messages } from '@point/i18n';

// The staff app's web app manifest (add-pwa-install design D1 · PW2 · PW3 · PW4 · AD-PWA-01): the document
// the route `/manifest.webmanifest` serves and its unit test reads. `/` is the start page, which opens Today.

/** The icon files of public/icons — the owner's logo replaces them under these names (PW1 · design D3). */
export const ICON_FILES = {
  any192: '/icons/icon-192.png',
  any512: '/icons/icon-512.png',
  maskable512: '/icons/icon-maskable-512.png',
  appleTouch: '/icons/apple-touch-icon.png',
} as const;

export interface StaffManifest {
  readonly id: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: 'standalone';
  readonly name: string;
  readonly short_name: string;
  readonly lang: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly {
    readonly src: string;
    readonly sizes: string;
    readonly type: string;
    readonly purpose: 'any' | 'maskable';
  }[];
}

/** The manifest of the staff host. `colour` is the hex of the `--background` token (PW2). */
export function staffManifest(messages: Pick<Messages, 'pwa'>, colour: string): StaffManifest {
  return {
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    name: messages.pwa.manifest.name,
    short_name: messages.pwa.manifest.shortName,
    lang: 'my',
    theme_color: colour,
    background_color: colour,
    icons: [
      { src: ICON_FILES.any192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: ICON_FILES.any512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: ICON_FILES.maskable512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
