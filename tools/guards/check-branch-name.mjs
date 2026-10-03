// guard:needs-input — run by CI job `pr-title`, not by `pnpm guards`.
// Branch names (CG-GIT-01 · design D3): feature/<change-id>, feature/<change-id>/<part>,
// chore/<topic>. Input: PR_BRANCH environment variable or --branch=… .
import { pathToFileURL } from 'node:url';

const VALID = [
  /^feature\/(add|change|remove|fix)-[a-z0-9-]+$/,
  /^feature\/(add|change|remove|fix)-[a-z0-9-]+\/[a-z0-9-]+$/,
  /^chore\/[a-z0-9-]+$/,
];

/** Returns the list of problems with a branch name; empty when it is valid. */
export function checkBranchName(branch) {
  if (VALID.some((re) => re.test(branch))) return [];
  return [
    `branch "${branch}" must be feature/<change-id>, feature/<change-id>/<part> or chore/<topic>` +
      ' — change id = add-… / change-… / remove-… / fix-…, lower case (CG-GIT-01)',
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hit = process.argv.find((a) => a.startsWith('--branch='));
  const branch = hit ? hit.slice('--branch='.length) : process.env.PR_BRANCH;
  if (!branch) {
    console.error('check-branch-name: PR_BRANCH is required');
    process.exit(2);
  }
  const errors = checkBranchName(branch);
  for (const e of errors) console.error(`check-branch-name: ${e}`);
  if (errors.length === 0) console.log(`check-branch-name: ok — "${branch}"`);
  process.exit(errors.length === 0 ? 0 : 1);
}
