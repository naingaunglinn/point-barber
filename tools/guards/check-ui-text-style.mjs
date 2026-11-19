// No text transform, italic or letter spacing in the shared components, and no site-only `--decoration`
// colour in them (AD-VIS-06 · FE-VIS-01b · add-shared-ui-components design D14). Myanmar has no letter
// case, and slanted or spaced Myanmar breaks its stacked marks; the decoration colour is the website's,
// for large text and icons only, and the components render in both trees. Scans the source and the
// stylesheets of packages/ui/src (tests excluded) with comments removed: the Tailwind classes
// `uppercase`, `italic`, `tracking-*` (with any variant), the CSS `text-transform: uppercase` /
// `font-style: italic` / `letter-spacing`, and `--decoration` or a `*-decoration` colour class. The
// catalogue's token table names `--decoration` to show it. `--root=<dir>` checks another tree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOPE = 'packages/ui/src';
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|css)$/;
const TEST = /\.test\.[cm]?[jt]sx?$/;
/** The catalogue's token table shows the site-only token by name. */
const TOKEN_TABLE = new Set([
  'packages/ui/src/catalogue/swatches.ts',
  'packages/ui/src/catalogue/contrast.ts',
]);

const CLASS = (name) => new RegExp(String.raw`(?<![\w-])(?:[\w-]+:)*!?${name}(?![\w-])`);
const CHECKS = [
  { problem: 'uppercase', pattern: CLASS('uppercase') },
  { problem: 'italic', pattern: CLASS('italic') },
  // Names the class it found (`tracking-wide`, `md:tracking-[0.2em]`), as the two above name theirs.
  {
    problem: (found) => found,
    pattern: CLASS(String.raw`tracking-(?:[\w.]+|\[[^\]\s]+\])`),
  },
  { problem: 'text-transform', pattern: /text-transform\s*:\s*(?:uppercase|capitalize)/ },
  { problem: 'font-style', pattern: /font-style\s*:\s*(?:italic|oblique)/ },
  { problem: 'letter-spacing', pattern: /letter-spacing\s*:/ },
  {
    problem: '--decoration',
    pattern:
      /--decoration(?![\w-])|(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|fill|stroke|ring|outline|from|via|to|shadow)-decoration(?![\w-])/,
    decoration: true,
  },
];

/** Comments become spaces (line breaks kept), so lines still count. */
function withoutComments(text, css) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  const block = text.replace(/\/\*[\s\S]*?\*\//g, blank);
  return css
    ? block
    : block.replace(
        /(^|[^:\\])\/\/[^\n]*/g,
        (match, before) => before + blank(match.slice(before.length)),
      );
}

/** Every finding: { path, line, problem }. */
export function findTextStyle(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(path);
        continue;
      }
      if (!SOURCE.test(entry.name) || TEST.test(entry.name)) continue;
      const rel = relative(root, path).split(sep).join('/');
      const lines = withoutComments(readFileSync(path, 'utf8'), entry.name.endsWith('.css')).split(
        '\n',
      );
      lines.forEach((line, index) => {
        for (const check of CHECKS) {
          if (check.decoration && TOKEN_TABLE.has(rel)) continue;
          const match = check.pattern.exec(line);
          if (match === null) continue;
          const problem =
            typeof check.problem === 'function' ? check.problem(match[0]) : check.problem;
          found.push({ path: rel, line: index + 1, problem });
        }
      });
    }
  };
  const dir = join(root, SCOPE);
  if (existsSync(dir)) walk(dir);
  return found;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const found = findTextStyle(root);
  for (const { path, line, problem } of found) {
    console.error(
      `check-ui-text-style: ${path}:${line} — ${problem} in a shared component (AD-VIS-06 · FE-VIS-01b)`,
    );
  }
  if (found.length === 0) {
    console.log(
      'check-ui-text-style: ok — no text transform, italic, letter spacing or --decoration in packages/ui/src',
    );
  }
  process.exit(found.length === 0 ? 0 : 1);
}
