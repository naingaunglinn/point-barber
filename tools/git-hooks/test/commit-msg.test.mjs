import { describe, expect, it } from 'vitest';

import { checkCommitHeader } from '../../guards/lib/conventional.mjs';

// The commit-msg hook checks only the Conventional Commit header (CG-GIT-02, design D15);
// the full PR-title rule runs in CI.
describe('commit-msg header check', () => {
  it.each(['feat(add-repo-scaffold): health endpoint', 'fix: typo', 'chore(deps)!: bump vitest'])(
    'accepts %s',
    (header) => {
      expect(checkCommitHeader(header)).toEqual([]);
    },
  );

  it.each(['update stuff', 'wip(x): not a type', 'feat:missing space'])('rejects %s', (header) => {
    expect(checkCommitHeader(header)).toHaveLength(1);
  });

  it.each([
    'Merge branch main into feature/add-repo-scaffold',
    'Revert "feat(x): y"',
    'fixup! feat(x): y',
  ])('leaves git-generated message %s alone', (header) => {
    expect(checkCommitHeader(header)).toEqual([]);
  });
});
