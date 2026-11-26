import { PWA_BACKGROUND } from '../../env';

/**
 * The colour of the staff app's bar and splash screen: `--background` as hex, inlined by next.config.ts
 * when Next.js builds (add-pwa-install design D2 · PW2). Throws when it was not — a build without the
 * token file must not ship an app with no colour.
 */
export function themeColour(): string {
  if (PWA_BACKGROUND === undefined)
    throw new Error('POINT_PWA_BACKGROUND was not set by next.config.ts');
  return PWA_BACKGROUND;
}
