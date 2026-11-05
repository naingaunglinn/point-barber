// The query keys of the Settings screens' server state (CG-UI-07 · add-company-profile design D8): every
// query, cache write and invalidation of lib/settings takes its key from here.

export const settingsKeys = {
  company: ['company'] as const,
};
