// Which checks the after-edit hook runs for one edited file (design D17, with the fallback of task
// 7.7): Prettier on every file in scope, then ESLint on code, without type information. D17's
// steps 3 and 4 — tsc for the owning workspace and the related unit tests — run in the pre-push
// check (.githooks/pre-push). Starts nothing.
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** D17 step 1: only files under these folders are checked. */
const SCOPE = /^(?:apps|packages|tools|e2e)\/|^db\/scripts\//;
/** Installed or generated files are never checked, even inside a scope folder. */
const GENERATED =
  /(?:^|\/)(?:node_modules|\.next|\.turbo|dist|coverage|playwright-report|test-results)\//;
/** Files ESLint lints (root eslint.config.mjs). */
const LINTED = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** `tool_input.file_path` of a Claude Code PostToolUse payload, or null. Throws on bad JSON. */
export function filePathOf(payload) {
  const path = JSON.parse(payload)?.tool_input?.file_path;
  return typeof path === 'string' && path !== '' ? path : null;
}

/**
 * The checks for `file` in the repository at `root`, or null when the hook leaves the file alone
 * (outside the repository or the scope folders, generated, or no longer there): `{ rel, eslint }` —
 * Prettier always runs, ESLint when `eslint` is true.
 */
export function planFor(root, file) {
  const fromRoot = relative(root, resolve(root, file));
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) return null;
  if (isAbsolute(fromRoot)) return null; // another drive on Windows
  const rel = fromRoot.split(sep).join('/');
  if (!SCOPE.test(rel) || GENERATED.test(rel) || !existsSync(join(root, rel))) return null;
  return { rel, eslint: LINTED.test(rel) };
}

/** The tools a plan starts, in D17 order: `{ label = the bin name, pkg, args }` per step. */
export function stepsFor(root, plan) {
  const target = join(root, plan.rel);
  const steps = [
    {
      label: 'prettier',
      pkg: 'prettier',
      args: ['--write', '--ignore-unknown', '--log-level', 'warn', target],
    },
  ];
  if (plan.eslint) {
    // Without the TypeScript program. No type-aware rule is on until add-ci-guard-rails, and
    // building the program kept the hook over D17's 10 s on native Windows (PR #8 review: ESLint
    // 12.2 s → 5.3 s, same findings). CI and `pnpm lint` keep the full configuration. When
    // add-ci-guard-rails turns the type-aware rules on, ESLint stops here with "requires type
    // information": that change re-measures and decides how the hook lints.
    const args = ['--no-warn-ignored', '--parser-options', 'projectService:false', target];
    steps.push({ label: 'eslint', pkg: 'eslint', args });
  }
  return steps;
}
