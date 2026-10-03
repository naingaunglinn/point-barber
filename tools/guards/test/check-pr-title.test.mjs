import { describe, expect, it } from 'vitest';

import { checkPrTitle } from '../check-pr-title.mjs';

// CG-GIT-02: `<type>(<change-id>): <summary ≤ 72 chars>`; on a chore/ branch the scope may be
// `repo` or `deps`.
describe('check-pr-title (CG-GIT-02)', () => {
  it('passes a feature title whose scope is the change id', () => {
    expect(
      checkPrTitle('feat(add-repo-scaffold): health endpoint', 'feature/add-repo-scaffold/api'),
    ).toEqual([]);
  });

  it('fails when the scope is not a change id', () => {
    const errors = checkPrTitle('feat(api): health endpoint', 'feature/add-repo-scaffold/api');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/scope "api"/);
    expect(errors[0]).toMatch(/CG-GIT-02/);
  });

  it('passes chore(deps) on a chore/ branch', () => {
    expect(checkPrTitle('chore(deps): bump vitest', 'chore/bump-vitest')).toEqual([]);
  });

  it('fails chore(deps) on a feature/ branch', () => {
    const errors = checkPrTitle('chore(deps): bump vitest', 'feature/add-repo-scaffold');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/scope "deps"/);
  });

  it('fails a title that is not a Conventional Commit', () => {
    const errors = checkPrTitle('update stuff', 'feature/add-repo-scaffold');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/not a Conventional Commit/);
  });

  it('fails an unknown type', () => {
    const errors = checkPrTitle(
      'feature(add-repo-scaffold): health endpoint',
      'feature/add-repo-scaffold',
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/type "feature"/);
  });

  it('fails a summary longer than 72 characters', () => {
    const summary = 'x'.repeat(73);
    const errors = checkPrTitle(`feat(add-repo-scaffold): ${summary}`, 'feature/add-repo-scaffold');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/72/);
  });

  it('accepts a summary of exactly 72 characters', () => {
    const summary = 'x'.repeat(72);
    expect(
      checkPrTitle(`feat(add-repo-scaffold): ${summary}`, 'feature/add-repo-scaffold'),
    ).toEqual([]);
  });
});
