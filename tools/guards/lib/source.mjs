// Shared by the new guards (add-ci-guards D2): the --root handling, the directory walk, comment
// removal and the failure line. The older guards keep their own copies (a clean-up is its own PR).
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.next',
  '.turbo',
  'generated',
]);
// The tests of the guards hold the forbidden text in their fixture strings on purpose.
const SKIP_PATH = 'tools/guards/test';

/** The `--root=<dir>` value, or the repository root (two folders above the guard file in `tools/guards`). */
export function rootFromArgs(importMetaUrl) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  return arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(importMetaUrl)), '../..');
}

/**
 * Repository paths (forward slashes, sorted) of the files under the `scopes` folders whose name ends
 * with one of the `extensions`. Skips the folders of SKIP_DIRS, `tools/guards/test` and, unless
 * `fixtures` is true, folders called `fixtures`; `skip` adds more folder names.
 */
export function walk(root, { scopes, extensions, skip = [], fixtures = false }) {
  const skipped = new Set([...SKIP_DIRS, ...skip, ...(fixtures ? [] : ['fixtures'])]);
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const repoPath = relative(root, path).split(sep).join('/');
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name) && repoPath !== SKIP_PATH) visit(path);
      } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
        found.push(repoPath);
      }
    }
  };
  for (const scope of scopes) {
    try {
      visit(join(root, scope));
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  return found.sort();
}

// A `/` after one of these starts a regular expression, not a division.
const REGEX_AFTER = /[(,=:[!&|?{};]$|^$|\b(?:return|typeof)$/;

/**
 * The text with `//` and block comments replaced by spaces (line breaks kept, so lines and columns
 * stay). Strings, templates and regular expression literals are kept; a `//` inside one is not a
 * comment, and the code of a template's `${…}` is read as code.
 */
export function stripComments(text) {
  const chars = [...text];
  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (chars[k] !== '\n') chars[k] = ' ';
  };
  const code = (start, untilBrace) => {
    let depth = 0;
    let i = start;
    while (i < chars.length) {
      const c = chars[i];
      const next = chars[i + 1];
      if (c === '/' && next === '/') {
        let end = i;
        while (end < chars.length && chars[end] !== '\n') end += 1;
        blank(i, end);
        i = end;
      } else if (c === '/' && next === '*') {
        let end = i + 2;
        while (end < chars.length && !(chars[end] === '*' && chars[end + 1] === '/')) end += 1;
        blank(i, Math.min(end + 2, chars.length));
        i = end + 2;
      } else if (
        c === '/' &&
        REGEX_AFTER.test(
          chars
            .slice(Math.max(0, i - 8), i)
            .join('')
            .trimEnd(),
        )
      ) {
        i = skipRegex(i);
      } else if (c === '"' || c === "'") {
        i += 1;
        while (i < chars.length && chars[i] !== c && chars[i] !== '\n')
          i += chars[i] === '\\' ? 2 : 1;
        i += 1;
      } else if (c === '`') {
        i = template(i + 1);
      } else if (untilBrace && c === '}' && depth === 0) {
        return i + 1;
      } else {
        if (c === '{') depth += 1;
        if (c === '}') depth -= 1;
        i += 1;
      }
    }
    return i;
  };
  // From the opening `/`: the index after the closing `/` of the literal, or after the `/` alone
  // when the line has no closing one (then it was a division).
  const skipRegex = (start) => {
    let i = start + 1;
    let inClass = false;
    while (i < chars.length && chars[i] !== '\n') {
      if (chars[i] === '\\') i += 1;
      else if (chars[i] === '[') inClass = true;
      else if (chars[i] === ']') inClass = false;
      else if (chars[i] === '/' && !inClass) return i + 1;
      i += 1;
    }
    return start + 1;
  };
  const template = (start) => {
    let i = start;
    while (i < chars.length && chars[i] !== '`') {
      if (chars[i] === '\\') i += 2;
      else if (chars[i] === '$' && chars[i + 1] === '{') i = code(i + 2, true);
      else i += 1;
    }
    return i + 1;
  };
  code(0, false);
  return chars.join('');
}

/** The 1-based line of the character at `index`. */
export function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

/**
 * Prints one line per hit to standard error, `<guard>: <path>[:<line>] — <message> (<CG ID>)`, or
 * `<guard>: ok — <okMessage>` to standard output; returns the exit status for `process.exit`.
 * A hit is `{ path, line?, message, cg }`.
 */
export function report(guard, hits, okMessage) {
  for (const { path, line, message, cg } of hits) {
    console.error(`${guard}: ${path}${line === undefined ? '' : `:${line}`} — ${message} (${cg})`);
  }
  if (hits.length === 0) console.log(`${guard}: ok — ${okMessage}`);
  return hits.length === 0 ? 0 : 1;
}
