import { loadMessages } from '@point/i18n';

import { staffManifest } from '../../../lib/pwa/manifest';
import { themeColour } from '../../../lib/pwa/theme-colour';

// `/manifest.webmanifest` of the staff host (add-pwa-install design D1 · PW3 · ADR-009): a static document,
// built once when Next.js builds, answered without a session (resolve-route.ts lists it among the open
// staff paths). The site tree has no such route, so the public host answers 404. The texts come from the
// `my` language file — the brand name is the same in both languages (PW4).
export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(staffManifest(loadMessages('my'), themeColour())), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
