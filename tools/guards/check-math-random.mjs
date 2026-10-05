// No Math.random in apps/api and packages/shared (CG-SEC-06 · design D19): ids come from UUIDv7 and
// secrets from node:crypto. Comments and prose in strings are skipped, so prose may name the call;
// the code inside a template literal's `${…}` is scanned, and so is `Math['random']`. The ESLint
// rule in tools/eslint/api.mjs catches the same forms with a real parser; this guard stays (D19).
// Checks the repository it lives in; `--root=<dir>` checks another tree (tests).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOPES = ['apps/api', 'packages/shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated', '.turbo']);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const CALL = /\bMath\s*(?:\.\s*random\b|\[\s*"random"\s*\])/;
// A string that is one word is kept (as "word"): it may be a computed member name.
const WORD = /^\w+$/;

/**
 * The code with comments removed, prose strings blanked (`""`), one-word strings kept as `"word"`,
 * and template literals reduced to the code of their `${…}` expressions.
 */
export function codeOnly(text) {
  return scan(text, 0, false).out;
}

/** Reads code from `start`; with `untilBrace`, stops after the `}` that closes a `${`. */
function scan(text, start, untilBrace) {
  let out = '';
  let depth = 0;
  let i = start;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      const content = text.slice(i + 1, j);
      out += WORD.test(content) ? `"${content}"` : '""';
      i = j + 1;
    } else if (c === '`') {
      const template = readTemplate(text, i + 1);
      out += `""${template.out}`;
      i = template.end;
    } else if (untilBrace && c === '}' && depth === 0) {
      return { out, end: i + 1 };
    } else {
      if (c === '{') depth += 1;
      if (c === '}') depth -= 1;
      out += c;
      i += 1;
    }
  }
  return { out, end: i };
}

/** From just after an opening backtick: the code of the `${…}` expressions, and the end index. */
function readTemplate(text, start) {
  let out = '';
  let i = start;
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      i += 2;
    } else if (text[i] === '$' && text[i + 1] === '{') {
      const expression = scan(text, i + 2, true);
      out += ` ${expression.out} `;
      i = expression.end;
    } else {
      i += 1;
    }
  }
  return { out, end: i + 1 };
}

/** Repository-relative paths of the files in scope that call Math.random. */
export function findMathRandom(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (SOURCE.test(entry.name) && CALL.test(codeOnly(readFileSync(path, 'utf8')))) {
        found.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  for (const scope of SCOPES) {
    const dir = join(root, scope);
    if (existsSync(dir)) walk(dir);
  }
  return found.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const files = findMathRandom(root);
  for (const path of files) {
    console.error(
      `check-math-random: ${path} — Math.random is not allowed here; use uuidV7() or node:crypto (CG-SEC-06)`,
    );
  }
  if (files.length === 0)
    console.log('check-math-random: ok — no Math.random in apps/api or packages/shared');
  process.exit(files.length === 0 ? 0 : 1);
}
