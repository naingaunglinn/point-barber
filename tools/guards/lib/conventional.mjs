// The Conventional Commits rules of CG-GIT-02 — one definition for the PR-title guard and the
// commit-msg hook.

export const TYPES = ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'build', 'ci', 'perf'];
export const CHANGE_ID = /^(add|change|remove|fix)-[a-z0-9-]+$/;
export const CHORE_SCOPES = ['repo', 'deps'];
export const MAX_SUMMARY = 72;

// `<type>(<scope>)!: <summary>` — scope and `!` optional at this level.
const HEADER = /^([a-z]+)(?:\(([^()\s]+)\))?(!)?: (\S.*)$/;

// Messages Git writes itself; the hook leaves them alone.
const GIT_GENERATED = /^(Merge |Revert "|fixup! |squash! |amend! )/;

/** Parses a header; returns null when it is not `<type>(<scope>)!: <summary>` shaped. */
export function parseHeader(header) {
  const m = HEADER.exec(header);
  if (!m) return null;
  return { type: m[1], scope: m[2] ?? null, breaking: m[3] === '!', summary: m[4] };
}

/** Header-only check used by the commit-msg hook: valid shape and a known type. */
export function checkCommitHeader(header) {
  if (GIT_GENERATED.test(header)) return [];
  const parsed = parseHeader(header);
  if (!parsed) {
    return [
      `"${header}" is not a Conventional Commit header "<type>(<scope>): <summary>" (CG-GIT-02)`,
    ];
  }
  if (!TYPES.includes(parsed.type)) {
    return [`type "${parsed.type}" is not one of ${TYPES.join(', ')} (CG-GIT-02)`];
  }
  return [];
}
