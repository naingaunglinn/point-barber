// No Math.random in apps/api and packages/shared (CG-SEC-06 · design D19): ids come from UUIDv7 and
// secrets from node:crypto. Comments and string contents are skipped, so prose may name the call.
// Checks the repository it lives in; `--root=<dir>` checks another tree (tests).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCOPES = ['apps/api', 'packages/shared'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'generated', '.turbo']);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const CALL = /\bMath\s*\.\s*random\b/;

/** The code with comments and the contents of string / template literals blanked out. */
export function codeOnly(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end === -1 ? text.length : end + 2;
      out += ' ';
    } else if (c === '"' || c === "'" || c === '`') {
      i += 1;
      while (i < text.length && text[i] !== c) i += text[i] === '\\' ? 2 : 1;
      i += 1;
      out += '""';
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
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
