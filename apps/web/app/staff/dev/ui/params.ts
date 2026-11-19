import { isLocale, resolveLocale, type Locale } from '@point/i18n';
import { toDate, type Instant } from '@point/shared';
import type { Tree } from '@point/ui';
import { PERSONAS, type Persona } from '@point/ui/catalogue';

// The query parameters of the catalogue (AD-IMPL-06 · design D12): `lang`, `theme`, `as`, `now`. They
// win over the cookie `point_locale` for this page only; an unknown value keeps the default.

// The personas and their grants live with the catalogue's fixtures (packages/ui/src/catalogue/personas.ts).
export { PERSONAS, type Persona };

/** Monday 05/Oct/2026 10:42 MMT — the catalogue clock of the spec. */
export const DEFAULT_NOW: Instant = '2026-10-05T10:42:00+06:30';

export interface CatalogueParams {
  readonly lang: Locale;
  readonly theme: Tree;
  readonly as: Persona;
  readonly now: Instant;
}

type SearchParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function first(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

/** A wire instant whose calendar fields exist (`2026-02-31…` is refused, not rolled over). */
function isInstant(value: string): boolean {
  try {
    toDate(value);
    const day = value.slice(0, 10);
    return toDate(`${day}T00:00:00Z`).toISOString().startsWith(day);
  } catch {
    return false;
  }
}

export function parseCatalogueParams(search: SearchParams, cookie?: string): CatalogueParams {
  const lang = first(search.lang);
  const theme = first(search.theme);
  const as = first(search.as);
  const now = first(search.now);
  return {
    lang: isLocale(lang) ? lang : resolveLocale({ cookie }),
    theme: theme === 'site' ? 'site' : 'staff',
    as: PERSONAS.find((persona) => persona === as) ?? 'admin',
    now: now !== undefined && isInstant(now) ? now : DEFAULT_NOW,
  };
}

/** The address of the catalogue with one or more parameters changed. */
export function catalogueHref(params: CatalogueParams, change: Partial<CatalogueParams>): string {
  const next = { ...params, ...change };
  const query = new URLSearchParams({
    lang: next.lang,
    theme: next.theme,
    as: next.as,
    now: next.now,
  });
  return `/dev/ui?${query.toString()}`;
}
