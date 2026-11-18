import type { Locale } from '@point/shared';

// A booking's services label (add-customer-management proposal reading 11 · design D10 — shared with
// add-booking-calendar): its items' service names in `sort_order`, joined with ", " as the Today card
// joins them; in English a service without `name_en` shows its Myanmar name (AD-L10N-03). Null for a
// booking without items.

export interface LabelledService {
  readonly name_mm: string;
  readonly name_en: string | null;
}

/** `Haircut, Shave` — the services already in `sort_order`. */
export function servicesLabel(services: readonly LabelledService[], locale: Locale): string | null {
  if (services.length === 0) return null;
  return services
    .map((service) => (locale === 'en' ? (service.name_en ?? service.name_mm) : service.name_mm))
    .join(', ');
}
