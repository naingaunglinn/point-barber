// add-branch-management — who reaches the branch screens (AD-PERM-02 · AD-PERM-03 · API-PERM-07 · design
// D9). The UI only mirrors the API, which checks every request.

/** The four branch codes (permissions.json): any of them, at any scope, opens Settings › Branches. */
export const BRANCH_CODES = [
  'branch.view',
  'branch.create',
  'branch.update',
  'branch.delete',
] as const;
