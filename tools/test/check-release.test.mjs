import { describe, expect, it, vi } from 'vitest';

import { RELEASE_TAG, checkRelease } from '../../infra/deploy/check-release.mjs';

// add-staging-deploy task 6.2 — platform-runtime spec "Only a release tag on main whose CI passed is
// published" (design D4): the first step of the release workflow, with git and the GitHub API injected.

const ON_MAIN = 'a1b2c3d4e5f6';
const ON_BRANCH = '0f9e8d7c6b5a';
const FAILED_ON_MAIN = '9a8b7c6d5e4f';

const deps = () => ({
  isOnMain: vi.fn(async (commit) => commit !== ON_BRANCH),
  ciConclusions: vi.fn(async (commit) => (commit === FAILED_ON_MAIN ? ['failure'] : ['success'])),
});

describe('check-release.mjs (task 6.2)', () => {
  it('Scenario: A tag on main is published — v0.2.0 on a main commit whose CI passed', async () => {
    expect(await checkRelease('v0.2.0', ON_MAIN, deps())).toStrictEqual({ ok: true });
  });

  it('Scenario: A tag outside main is refused — before CI is even asked', async () => {
    const d = deps();
    expect(await checkRelease('v0.2.1', ON_BRANCH, d)).toStrictEqual({
      ok: false,
      message: 'v0.2.1 is not on main',
    });
    expect(d.ciConclusions).not.toHaveBeenCalled();
  });

  it('Scenario: A commit whose CI failed is refused', async () => {
    expect(await checkRelease('v0.2.2', FAILED_ON_MAIN, deps())).toStrictEqual({
      ok: false,
      message: `CI did not pass for ${FAILED_ON_MAIN}`,
    });
  });

  it.each([
    [[], 'no CI run for the commit'],
    [[null], 'a run still in progress'],
    [['cancelled'], 'a cancelled run'],
  ])('CI that has not passed (%j — %s) is refused', async (conclusions) => {
    const d = { ...deps(), ciConclusions: async () => conclusions };
    expect(await checkRelease('v0.2.0', ON_MAIN, d)).toStrictEqual({
      ok: false,
      message: `CI did not pass for ${ON_MAIN}`,
    });
  });

  it('one successful run among re-runs is enough', async () => {
    const d = { ...deps(), ciConclusions: async () => ['failure', 'success'] };
    expect(await checkRelease('v0.2.0', ON_MAIN, d)).toStrictEqual({ ok: true });
  });

  it.each(['v1.2', '1.2.3', 'v1.2.3-rc.1', 'v1.2.3 ', 'main', 'v1.2.3;ls'])(
    'a tag that is not v<major>.<minor>.<patch> is refused before git is asked: %j',
    async (tag) => {
      const d = deps();
      const result = await checkRelease(tag, ON_MAIN, d);
      expect(result).toStrictEqual({
        ok: false,
        message: `${tag} is not a release tag (v<major>.<minor>.<patch>)`,
      });
      expect(d.isOnMain).not.toHaveBeenCalled();
    },
  );

  it('the release tag pattern is the deploy entry point pattern', () => {
    expect(RELEASE_TAG.source).toBe('^v[0-9]+\\.[0-9]+\\.[0-9]+$');
  });
});
