// The query keys of the walk-in's server state (CG-UI-07 · add-walkin-visit-checkout design D11): every
// query, cache write and invalidation of lib/pos takes its key from here. The open visits sit under
// `['me']`, so the session layer's invalidation of the signed-in user reloads them too.

export const posKeys = {
  openVisits: ['me', 'visits', 'open'] as const,
  sale: (id: string) => ['sale', id] as const,
  visit: (id: string) => ['visit', id] as const,
  services: (branchId: string | undefined) => ['services', branchId, 'simple'] as const,
  categories: ['service-categories'] as const,
  paymentMethods: ['payment-methods'] as const,
  quote: (
    branchId: string | undefined,
    employeeId: string | undefined,
    date: string | undefined,
    serviceIds: readonly string[] | undefined,
  ) => ['quote', branchId, employeeId, date, serviceIds] as const,
  receipt: (saleId: string) => ['receipt', saleId] as const,
};
