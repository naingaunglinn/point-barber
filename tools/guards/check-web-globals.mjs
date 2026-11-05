// Features are detected, never guessed from the user agent (AD-PWA-02 · CG-UI-09), and the page can
// always be zoomed (AD-A11Y-05) — add-shared-ui-components design D14 row 64. Fails on
// `navigator.userAgent` (also `navigator['userAgent']`) in apps/web and packages/*, and on a viewport
// that disables zoom: `user-scalable=no` / `userScalable: false`, `maximum-scale=1` / `maximumScale: 1`.
// Comments are skipped. `--root=<dir>` checks another tree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOPES = ['apps/web', 'packages'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage', 'public']);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|html)$/;

const CHECKS = [
  {
    problem: 'navigator.userAgent',
    pattern: /navigator\s*(?:\.\s*userAgent\b|\[\s*['"`]userAgent['"`]\s*\])/,
  },
  { problem: 'user-scalable=no', pattern: /user-scalable\s*=\s*(?:no|0)\b/ },
  { problem: 'userScalable: false', pattern: /userScalable\s*:\s*false\b/ },
  { problem: 'maximum-scale=1', pattern: /maximum-scale\s*=\s*1(?:\.0*)?(?![\d.])/ },
  { problem: 'maximumScale: 1', pattern: /maximumScale\s*:\s*1(?:\.0*)?(?![\d.])/ },
];

function withoutComments(text) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:\\])\/\/[^\n]*/g,
      (match, before) => before + blank(match.slice(before.length)),
    );
}

/** Every finding: { path, line, problem }. */
export function findWebGlobals(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
        continue;
      }
      if (!SOURCE.test(entry.name)) continue;
      const rel = relative(root, path).split(sep).join('/');
      withoutComments(readFileSync(path, 'utf8'))
        .split('\n')
        .forEach((line, index) => {
          for (const { problem, pattern } of CHECKS) {
            if (pattern.test(line)) found.push({ path: rel, line: index + 1, problem });
          }
        });
    }
  };
  for (const scope of SCOPES) {
    const dir = join(root, scope);
    if (existsSync(dir)) walk(dir);
  }
  return found;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const found = findWebGlobals(root);
  for (const { path, line, problem } of found) {
    console.error(
      `check-web-globals: ${path}:${line} — ${problem}: detect the feature, keep zoom (AD-PWA-02 · AD-A11Y-05)`,
    );
  }
  if (found.length === 0)
    console.log('check-web-globals: ok — no user-agent sniffing, zoom never disabled');
  process.exit(found.length === 0 ? 0 : 1);
}
