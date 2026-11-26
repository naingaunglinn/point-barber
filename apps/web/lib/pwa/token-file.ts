// Reads packages/ui/tokens.css for the build (add-pwa-install design D2): next.config.ts inlines the
// staff colours into the bundles, and the Vitest config hands the same values to the tests, so no run-time
// file access is needed in the standalone image.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { tokenHex } from './token-colour';

/** The text of the token file of the workspace package `@point/ui`. */
export function readTokenCss(): string {
  return readFileSync(createRequire(import.meta.url).resolve('@point/ui/tokens.css'), 'utf8');
}

/** The hex colours of the staff tree the manifest and the page head use. */
export function staffColours(): { readonly background: string; readonly primary: string } {
  const css = readTokenCss();
  return { background: tokenHex(css, '--background'), primary: tokenHex(css, '--primary') };
}
