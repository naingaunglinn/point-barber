// The query keys of the Settings screens' server state (CG-UI-07 · add-settings-store design D10 ·
// add-company-profile design D8): every query, cache write and invalidation of lib/settings takes its
// key from here. The settings lists and histories sit under `['settings']`, so one invalidation after a
// write reloads them all.

export const settingsKeys = {
  all: ['settings'] as const,
  list: (branchId: string | undefined) => ['settings', { branchId }] as const,
  history: (key: string, branchId: string | undefined) =>
    ['settings', 'history', key, { branchId }] as const,
  systemStatus: ['system', 'status'] as const,
  company: ['company'] as const,
};
