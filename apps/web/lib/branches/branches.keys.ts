// The query keys of the branch screens (CG-UI-07 · add-branch-management design D9): every query and
// invalidation of lib/branches takes its key from here. Invalidating `all` reloads the list and every
// detail.

export const branchKeys = {
  all: ['branches'] as const,
  list: ['branches', 'list'] as const,
  detail: (id: string) => ['branches', 'detail', id] as const,
};
