// The language files are complete (AD-L10N-01 · AD-IMPL-05 · design D6): `my` and `en` have the same
// keys, no value is empty, every status constant (packages/shared/src/constants/status.ts), every
// derived state and flag of the status map and every error code (constants/error-codes.ts) has its
// label. One line per finding, `<lang>: missing <key>` / `<lang>: empty <key>`; exit code 1.
// One exception: a `receipt.*` value in `my` may be `null` — receipts are printed in English only
// (AD-RCPT-01) and the Myanmar texts are written when a Myanmar receipt is wanted (owner 12/Oct/2026).
// Alias: `pnpm i18n:check`. Checks the repository it lives in; `--root=<dir>` checks another tree.
//
// The constant files are loaded by Node's type stripping, so they and the status map keep
// import-free, plain `as const` objects. The status map (packages/ui/src/status/status-map.ts)
// exports `DERIVED_STATES` (table → state → style) and `FLAGS` (key → style); without it the guard fails.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LANGUAGES = ['my', 'en'];
const MESSAGES = 'packages/i18n/messages';
const STATUS = 'packages/shared/src/constants/status.ts';
const ERROR_CODES = 'packages/shared/src/constants/error-codes.ts';
const STATUS_MAP = 'packages/ui/src/status/status-map.ts';

/** A value that may stay `null`: the Myanmar receipt labels. */
const mayBeNull = (lang, key) => lang === 'my' && key.startsWith('receipt.');

/** `{ action: { retry: 'Retry' } }` → [['action.retry', 'Retry']]. */
function leaves(tree, prefix = '') {
  return Object.entries(tree).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? leaves(value, `${prefix}${key}.`)
      : [[`${prefix}${key}`, value]],
  );
}

/** The messages of one language as a Map of dotted key → value, plus the files it could not read. */
function readLanguage(root, lang) {
  const dir = join(root, MESSAGES, lang);
  const values = new Map();
  const unreadable = [];
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
  for (const file of files.sort()) {
    try {
      const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      for (const [key, value] of leaves(json, `${file.replace(/\.json$/, '')}.`)) {
        values.set(key, value);
      }
    } catch (error) {
      unreadable.push(`${lang}: cannot read ${file}: ${error.message}`);
    }
  }
  return { values, unreadable };
}

async function load(root, path) {
  return import(pathToFileURL(join(root, path)).href);
}

/** The keys the code requires: status labels, flag labels and error messages. */
export async function requiredKeys(root) {
  const keys = [];
  const { STATUS_BY_TABLE } = await load(root, STATUS);
  for (const [table, constants] of Object.entries(STATUS_BY_TABLE)) {
    for (const name of Object.keys(constants)) keys.push(`status.${table}.${name}`);
  }
  const errorCodes = await load(root, ERROR_CODES);
  for (const group of ['ErrorCode', 'FieldIssueCode', 'ClientMessageCode']) {
    for (const code of Object.values(errorCodes[group] ?? {})) keys.push(`error.${code}`);
  }
  if (!existsSync(join(root, STATUS_MAP))) {
    return {
      keys,
      missing: [`check-i18n: ${STATUS_MAP} not found — the derived states and flags need it`],
    };
  }
  const { DERIVED_STATES, FLAGS } = await load(root, STATUS_MAP);
  for (const [table, states] of Object.entries(DERIVED_STATES)) {
    for (const name of Object.keys(states)) keys.push(`status.${table}.${name}`);
  }
  for (const flag of Object.keys(FLAGS)) keys.push(`status.flag.${flag}`);
  return { keys, missing: [] };
}

/** Every finding, one line each, in a stable order. */
export async function findProblems(root) {
  const languages = LANGUAGES.map((lang) => ({ lang, ...readLanguage(root, lang) }));
  const { keys: required, missing } = await requiredKeys(root);
  const all = new Set([...languages.flatMap(({ values }) => [...values.keys()]), ...required]);
  const problems = [...missing];
  for (const { lang, values, unreadable } of languages) {
    problems.push(...unreadable);
    for (const key of [...all].sort()) {
      if (!values.has(key)) problems.push(`${lang}: missing ${key}`);
      else if (values.get(key) === null && mayBeNull(lang, key)) continue;
      else if (typeof values.get(key) !== 'string' || values.get(key).trim() === '') {
        problems.push(`${lang}: empty ${key}`);
      }
    }
  }
  return { problems, keys: all.size };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { problems, keys } = await findProblems(root);
  for (const line of problems) console.error(line);
  if (problems.length === 0) console.log(`check-i18n: ok — ${keys} keys in my and en`);
  process.exit(problems.length === 0 ? 0 : 1);
}
