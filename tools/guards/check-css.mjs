// Colours and fonts in CSS come only from packages/ui/tokens.css (CG-UI-05 · AD-IMPL-05 ·
// design D16). Fails on a hex colour, a font-family declaration or a font shorthand in any other
// CSS file of the repository. rgb() / hsl() / oklch() values are added by add-shared-ui-components
// (guideline §24 row 61). Checks the repository it lives in; `--root=<dir>` checks another tree.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOKENS = 'packages/ui/tokens.css';
const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const HEX = /(?<![\w&])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])/i;
// `property: value` ended by `;` or `}`. A selector is ended by `{`, so `#add {` or `a:hover {`
// is never read as a declaration.
const DECLARATION = /([-\w]+)\s*:\s*([^;{}]*)(?=[;}])/g;
// A font shorthand with one of these values sets no family.
const CSS_WIDE = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

function cssFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile() && entry.name.endsWith('.css')) {
        files.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return files.sort();
}

function problemOf(property, value) {
  if (property === 'font-family') return 'font-family';
  if (property === 'font' && !CSS_WIDE.has(value.toLowerCase())) return 'font shorthand';
  if (HEX.test(value)) return 'hex colour';
  return null;
}

/** Every colour or font declaration outside the token file: { path, line, problem }. */
export function findCssViolations(root) {
  const violations = [];
  for (const path of cssFiles(root)) {
    if (path === TOKENS) continue;
    // Comments become spaces (line breaks kept), so `/* #fff */` is ignored and lines still count.
    const code = readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) =>
      comment.replace(/[^\n]/g, ' '),
    );
    for (const match of code.matchAll(DECLARATION)) {
      const property = match[1].toLowerCase();
      const value = match[2].replace(/url\([^)]*\)/gi, 'url()').trim();
      const problem = problemOf(property, value);
      if (problem !== null) {
        const line = code.slice(0, match.index).split('\n').length;
        violations.push({ path, line, problem });
      }
    }
  }
  return violations;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const violations = findCssViolations(root);
  for (const { path, line, problem } of violations) {
    console.error(
      `check-css: ${path}:${line} — ${problem} outside ${TOKENS}; use a token (CG-UI-05 · AD-IMPL-05)`,
    );
  }
  if (violations.length === 0) console.log(`check-css: ok — colours and fonts only in ${TOKENS}`);
  process.exit(violations.length === 0 ? 0 : 1);
}
