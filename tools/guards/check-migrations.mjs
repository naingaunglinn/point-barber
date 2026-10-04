// Migration guard (CG-DB-02 · design D4.11 · system-design §4.1). Fails when a file under
// db/migrations/ that exists on main is modified or deleted, or when a new migration contains
// destructive DDL (DROP TABLE, DROP [COLUMN], RENAME, ALTER [COLUMN] … TYPE) — in its code or in the
// SQL a DO block builds for EXECUTE. Comments and string literals are not code.
// Base: MIGRATION_BASE_REF, else origin/main, else main; on main itself, HEAD^. Nothing to compare
// against is a failure, never a pass.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATIONS = 'db/migrations';

// PostgreSQL makes COLUMN optional in DROP [COLUMN] and ALTER [COLUMN] … [SET DATA] TYPE. `%I` lets
// the patterns read format() strings of dynamic SQL too.
const DESTRUCTIVE = [
  { name: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  {
    name: 'DROP COLUMN',
    re: /\bALTER\s+TABLE\b[^;]*?\bDROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(?!(?:CONSTRAINT|DEFAULT|NOT|IDENTITY|EXPRESSION)\b)[\w"%]/i,
  },
  { name: 'RENAME', re: /\bRENAME\b/i },
  {
    name: 'ALTER COLUMN … TYPE',
    re: /\bALTER\s+TABLE\b[^;]*?\bALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|%I|\w+)\s+(?:SET\s+DATA\s+)?TYPE\b/i,
  },
];

/**
 * Splits SQL into code (comments removed, string literals and quoted identifiers blanked),
 * the string literals, and the dollar-quoted bodies.
 */
export function tokenize(sql) {
  let code = '';
  const strings = [];
  const bodies = [];
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      code += ' ';
      continue;
    }
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? '')) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end;
      bodies.push(sql.slice(i + tag.length, stop));
      i = end === -1 ? sql.length : end + tag.length;
      code += ' $$ ';
      continue;
    }
    const escaped =
      (sql[i] === 'E' || sql[i] === 'e') &&
      sql[i + 1] === "'" &&
      !/[A-Za-z0-9_]/.test(sql[i - 1] ?? '');
    if (sql[i] === "'" || escaped) {
      let j = i + (escaped ? 2 : 1);
      let text = '';
      while (j < sql.length) {
        if (escaped && sql[j] === '\\') {
          text += sql.slice(j, j + 2);
          j += 2;
        } else if (sql[j] === "'" && sql[j + 1] === "'") {
          text += "'";
          j += 2;
        } else if (sql[j] === "'") {
          break;
        } else {
          text += sql[j];
          j += 1;
        }
      }
      strings.push(text);
      i = j + 1;
      code += "''";
      continue;
    }
    if (sql[i] === '"') {
      const end = sql.indexOf('"', i + 1);
      i = end === -1 ? sql.length : end + 1;
      code += '"x"';
      continue;
    }
    code += sql[i];
    i += 1;
  }
  return { code, strings, bodies };
}

/** Names of the destructive statements in a migration (code, DO-block code, EXECUTE strings). */
export function destructiveStatements(sql) {
  const found = new Set();
  const scan = (text) =>
    DESTRUCTIVE.filter((d) => d.re.test(text)).forEach((d) => found.add(d.name));
  const top = tokenize(sql);
  scan(top.code);
  for (const body of top.bodies) {
    const inner = tokenize(body);
    scan(inner.code);
    if (/\bEXECUTE\b/i.test(inner.code)) inner.strings.forEach(scan);
  }
  return [...found];
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

/** Like git(), but null when the revision does not exist; every other git failure is thrown. */
function gitRevision(cwd, args) {
  try {
    return git(cwd, args);
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim();
    // `rev-parse --verify --quiet` answers a missing revision with exit 1 and no message.
    const quietMiss = error.status === 1 && stderr === '';
    if (
      quietMiss ||
      /not a valid object name|unknown revision|bad revision|ambiguous argument|Needed a single revision/i.test(
        stderr,
      )
    ) {
      return null;
    }
    throw error;
  }
}

function resolveBase(cwd, baseRef) {
  const refs = baseRef
    ? [baseRef]
    : [process.env.MIGRATION_BASE_REF, 'origin/main', 'main'].filter(Boolean);
  for (const ref of refs) {
    if (gitRevision(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === null)
      continue;
    let base;
    try {
      base = git(cwd, ['merge-base', 'HEAD', ref]);
    } catch {
      throw new Error(
        `no common history between HEAD and ${ref} (shallow clone?) — fetch the full history; nothing was checked (CG-DB-02)`,
      );
    }
    const head = git(cwd, ['rev-parse', 'HEAD']);
    if (base !== head) return base;
    // On main itself (or a branch with no commit yet): the last commit's changes plus the working
    // tree; with no parent commit, the working tree only.
    return gitRevision(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD^']) ?? head;
  }
  throw new Error(
    `no base ref (${refs.join(', ')}) — fetch main or set MIGRATION_BASE_REF; nothing was checked (CG-DB-02)`,
  );
}

/** Returns the list of problems; empty when the migrations are fine. Throws when nothing can be compared. */
export function checkMigrations({ cwd = process.cwd(), baseRef } = {}) {
  const base = resolveBase(cwd, baseRef);
  const changes = git(cwd, ['diff', '--name-status', '--no-renames', base, '--', MIGRATIONS])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status, path] = line.split('\t');
      return { status: status.charAt(0), path };
    });
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '--', MIGRATIONS])
    .split('\n')
    .filter(Boolean)
    .map((path) => ({ status: 'A', path }));

  const problems = [];
  for (const { status, path } of [...changes, ...untracked]) {
    const short = path.slice(MIGRATIONS.length + 1);
    if (status === 'M') {
      problems.push(
        `${short}: merged migration file modified — write a new migration instead (CG-DB-02)`,
      );
    } else if (status === 'D') {
      problems.push(`${short}: merged migration file deleted (CG-DB-02)`);
    } else if (status === 'A' && path.endsWith('/migration.sql') && existsSync(join(cwd, path))) {
      const hits = destructiveStatements(readFileSync(join(cwd, path), 'utf8'));
      if (hits.length > 0) {
        problems.push(
          `${short}: destructive DDL (${hits.join(', ')}) — migrations are additive during V1 (CG-DB-02)`,
        );
      }
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let problems;
  try {
    problems = checkMigrations();
  } catch (error) {
    console.error(`check-migrations: ${error.message}`);
    process.exit(1);
  }
  for (const p of problems) console.error(`check-migrations: ${p}`);
  if (problems.length === 0) console.log('check-migrations: ok');
  process.exit(problems.length === 0 ? 0 : 1);
}
