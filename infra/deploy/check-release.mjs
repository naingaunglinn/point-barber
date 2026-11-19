// The first job of release.yml (add-staging-deploy design D4 · spec "Only a release tag on main whose
// CI passed is published"): before any image is built, the tag must be a release tag, its commit must
// be on main, and the `CI` workflow must have passed for that commit on main.
//   node infra/deploy/check-release.mjs <tag> <commit>
// The git and GitHub calls are injected, so the unit tests need no repository and no network.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** A release tag (spec "The deploy key runs only…" uses the same pattern). */
export const RELEASE_TAG = /^v[0-9]+\.[0-9]+\.[0-9]+$/;

/**
 * @param {string} tag
 * @param {string} commit
 * @param {{
 *   isOnMain: (commit: string) => Promise<boolean>,
 *   ciConclusions: (commit: string) => Promise<readonly (string | null)[]>,
 * }} deps
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function checkRelease(tag, commit, { isOnMain, ciConclusions }) {
  if (!RELEASE_TAG.test(tag)) {
    return { ok: false, message: `${tag} is not a release tag (v<major>.<minor>.<patch>)` };
  }
  if (!(await isOnMain(commit))) return { ok: false, message: `${tag} is not on main` };
  const conclusions = await ciConclusions(commit);
  if (!conclusions.includes('success'))
    return { ok: false, message: `CI did not pass for ${commit}` };
  return { ok: true };
}

/** `git merge-base --is-ancestor` exits 0 when the commit is on main, 1 when it is not. */
function gitIsOnMain(commit) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'origin/main'], {
      stdio: 'ignore',
    });
    return Promise.resolve(true);
  } catch (error) {
    if (error.status === 1) return Promise.resolve(false);
    throw error;
  }
}

/** The conclusions of the `CI` workflow's push runs for the commit on main (GitHub REST API). */
async function githubCiConclusions(commit) {
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  const query = new URLSearchParams({
    head_sha: commit,
    branch: 'main',
    event: 'push',
    per_page: '20',
  });
  const response = await fetch(
    `${api}/repos/${repository}/actions/workflows/ci.yml/runs?${query}`,
    {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub API answered ${response.status}`);
  const { workflow_runs: runs } = await response.json();
  return runs.map((run) => run.conclusion);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [tag, commit] = process.argv.slice(2);
  if (!tag || !commit) {
    console.error('usage: check-release.mjs <tag> <commit>');
    process.exit(2);
  }
  const result = await checkRelease(tag, commit, {
    isOnMain: gitIsOnMain,
    ciConclusions: githubCiConclusions,
  });
  if (!result.ok) {
    console.error(`::error::${result.message}`);
    console.error(result.message);
    process.exit(1);
  }
  console.log(`${tag} (${commit}) is on main and its CI passed`);
}
