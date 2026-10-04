// Which checks the after-edit hook runs for one edited file (design D17). Reads only the
// package.json / tsconfig.json files of the tree it is given; starts nothing.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

/** D17 step 1: only files under these folders are checked. */
const SCOPE = /^(?:apps|packages|tools|e2e)\/|^db\/scripts\//;
/** Installed or generated files are never checked, even inside a scope folder. */
const GENERATED =
  /(?:^|\/)(?:node_modules|\.next|\.turbo|dist|coverage|playwright-report|test-results)\//;
/** Files ESLint lints (root eslint.config.mjs). */
const LINTED = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/** Files that can change what the compiler or a unit test sees: code, and JSON (the catalogues). */
const COMPILED = /\.(?:[cm]?[jt]s|[jt]sx|json)$/;
/** The Vitest project of the root tooling tests (vitest.config.mjs): tools/ and db/scripts/. */
const TOOLING_PROJECT = 'tooling';

/** `tool_input.file_path` of a Claude Code PostToolUse payload, or null. Throws on bad JSON. */
export function filePathOf(payload) {
  const path = JSON.parse(payload)?.tool_input?.file_path;
  return typeof path === 'string' && path !== '' ? path : null;
}

/** The nearest folder below the root, from `dir` up, that has a package.json — or null. */
function owningWorkspace(root, dir) {
  for (let current = dir; current !== '.' && current !== ''; current = posix.dirname(current)) {
    if (existsSync(join(root, current, 'package.json'))) return current;
  }
  return null;
}

/**
 * The checks for `file` in the repository at `root`, or null when the hook leaves the file alone
 * (outside the repository or the scope folders, generated, or no longer there):
 * `{ rel, workspace, eslint, tsconfig, vitestProject }` — Prettier always runs; `workspace` is the
 * owning workspace folder or null; `tsconfig` is its tsconfig.json or null; `vitestProject` is the
 * project of the root Vitest config or null.
 */
export function planFor(root, file) {
  const fromRoot = relative(root, resolve(root, file));
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) return null;
  if (isAbsolute(fromRoot)) return null; // another drive on Windows
  const rel = fromRoot.split(sep).join('/');
  if (!SCOPE.test(rel) || GENERATED.test(rel) || !existsSync(join(root, rel))) return null;

  const compiled = COMPILED.test(rel);
  const workspace = owningWorkspace(root, posix.dirname(rel));
  const tsconfig = workspace === null ? null : join(root, workspace, 'tsconfig.json');

  let vitestProject = null;
  // e2e/ holds Playwright specs only; Playwright never runs in the hook (D17).
  if (compiled && !rel.startsWith('e2e/')) {
    if (workspace === null) {
      vitestProject = TOOLING_PROJECT;
    } else {
      const { name } = JSON.parse(readFileSync(join(root, workspace, 'package.json'), 'utf8'));
      vitestProject = typeof name === 'string' && name !== '' ? name : posix.basename(workspace);
    }
  }

  return {
    rel,
    workspace,
    eslint: LINTED.test(rel),
    tsconfig: compiled && tsconfig !== null && existsSync(tsconfig) ? tsconfig : null,
    vitestProject,
  };
}
