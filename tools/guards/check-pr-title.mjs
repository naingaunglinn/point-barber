// guard:needs-input — run by CI job `pr-title`, not by `pnpm guards`.
// PR title = the squash commit (CG-GIT-02 · design D15):
//   <type>(<change-id>): <summary ≤ 72 chars>; on a chore/ branch the scope may be repo or deps.
// Input: PR_TITLE and PR_BRANCH environment variables (CI passes them; never interpolated
// into the shell), or --title=… --branch=… on the command line.
import { pathToFileURL } from 'node:url';

import { CHANGE_ID, CHORE_SCOPES, MAX_SUMMARY, TYPES, parseHeader } from './lib/conventional.mjs';

/** Returns the list of problems with a PR title; empty when it is valid. */
export function checkPrTitle(title, branch) {
  const parsed = parseHeader(title);
  if (!parsed || parsed.scope === null) {
    return [`"${title}" is not a Conventional Commit "<type>(<change-id>): <summary>" (CG-GIT-02)`];
  }
  const errors = [];
  if (!TYPES.includes(parsed.type)) {
    errors.push(`type "${parsed.type}" is not one of ${TYPES.join(', ')} (CG-GIT-02)`);
  }
  const choreScope = branch.startsWith('chore/') && CHORE_SCOPES.includes(parsed.scope);
  if (!CHANGE_ID.test(parsed.scope) && !choreScope) {
    errors.push(
      `scope "${parsed.scope}" is not a change id (add-… / change-… / remove-… / fix-…)` +
        (CHORE_SCOPES.includes(parsed.scope)
          ? ` — "${parsed.scope}" is allowed only on a chore/ branch`
          : '') +
        ' (CG-GIT-02)',
    );
  }
  if (parsed.summary.length > MAX_SUMMARY) {
    errors.push(
      `summary is ${parsed.summary.length} characters; at most ${MAX_SUMMARY} (CG-GIT-02)`,
    );
  }
  return errors;
}

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const title = arg('title') ?? process.env.PR_TITLE;
  const branch = arg('branch') ?? process.env.PR_BRANCH;
  if (!title || !branch) {
    console.error('check-pr-title: PR_TITLE and PR_BRANCH are required');
    process.exit(2);
  }
  const errors = checkPrTitle(title, branch);
  for (const e of errors) console.error(`check-pr-title: ${e}`);
  if (errors.length === 0) console.log(`check-pr-title: ok — "${title}"`);
  process.exit(errors.length === 0 ? 0 : 1);
}
