// The query keys of the customer screens (CG-UI-07 · add-customer-management design D11): every query and
// invalidation of lib/customers takes its key from here. Invalidating `all` reloads the list, every detail
// and every timeline.

export const customerKeys = {
  all: ['customers'] as const,
  list: (query: string) => ['customers', 'list', query] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
  timeline: (id: string) => ['customers', 'timeline', id] as const,
};
