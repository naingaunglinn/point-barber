import { describe, expect, it } from 'vitest';

import { checkBranchName } from '../check-branch-name.mjs';

// CG-GIT-01 · design D3: feature/<change-id>, feature/<change-id>/<part>, chore/<topic>.
describe('check-branch-name (CG-GIT-01)', () => {
  it.each(['feature/add-repo-scaffold', 'feature/add-repo-scaffold/db', 'chore/bump-vitest'])(
    'passes %s',
    (branch) => {
      expect(checkBranchName(branch)).toEqual([]);
    },
  );

  it.each(['my-branch', 'feature/Scaffold', 'feature/update-stuff'])('fails %s', (branch) => {
    const errors = checkBranchName(branch);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/CG-GIT-01/);
  });
});
