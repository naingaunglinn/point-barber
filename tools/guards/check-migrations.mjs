// Migration guard (CG-DB-02 · design D4.11 · system-design §4.1). Fails when a migration that
// exists on main is modified or deleted, or when a new migration contains destructive DDL
// (DROP TABLE, DROP COLUMN, RENAME, ALTER COLUMN … TYPE). Comments and string literals are
// ignored. Base: MIGRATION_BASE_REF, else origin/main, else main; on main itself, HEAD^.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIGRATIONS = 'db/migrations';
const DESTRUCTIVE = [
  { name: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  { name: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { name: 'RENAME', re: /\bRENAME\b/i },
  { name: 'ALTER COLUMN … TYPE', re: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i },
];

/** Removes `--` and `/* … *\/` comments and single-quoted string literals. */
export function stripCommentsAndStrings(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else if (sql[i] === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i += 1;
      }
      i += 1;
      out += "''";
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

function tryGit(cwd, args) {
  try {
    return git(cwd, args);
  } catch {
    return null;
  }
}

function resolveBase(cwd, baseRef) {
  const refs = baseRef
    ? [baseRef]
    : [process.env.MIGRATION_BASE_REF, 'origin/main', 'main'].filter(Boolean);
  for (const ref of refs) {
    const base = tryGit(cwd, ['merge-base', 'HEAD', ref]);
    if (!base) continue;
    const head = git(cwd, ['rev-parse', 'HEAD']);
    if (base !== head) return base;
    // On main itself (or a branch with no commit yet): the last commit's changes plus the
    // working tree; with no parent commit, the working tree only.
    return tryGit(cwd, ['rev-parse', 'HEAD^']) ?? head;
  }
  return null;
}

/** Returns the list of problems; empty when the migrations are fine. */
export function checkMigrations({ cwd = process.cwd(), baseRef } = {}) {
  const base = resolveBase(cwd, baseRef);
  if (!base) return [];
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
    if (!path.endsWith('/migration.sql')) continue;
    const short = path.slice(MIGRATIONS.length + 1);
    if (status === 'M')
      problems.push(
        `${short}: merged migration modified — write a new migration instead (CG-DB-02)`,
      );
    else if (status === 'D') problems.push(`${short}: merged migration deleted (CG-DB-02)`);
    else if (status === 'A' && existsSync(join(cwd, path))) {
      const code = stripCommentsAndStrings(readFileSync(join(cwd, path), 'utf8'));
      const hits = DESTRUCTIVE.filter((d) => d.re.test(code)).map((d) => d.name);
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
  const problems = checkMigrations();
  for (const p of problems) console.error(`check-migrations: ${p}`);
  if (problems.length === 0) console.log('check-migrations: ok');
  process.exit(problems.length === 0 ? 0 : 1);
}
