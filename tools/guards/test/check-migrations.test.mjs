import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkMigrations } from '../check-migrations.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

function write(cwd, name, sql) {
  const dir = join(cwd, 'db', 'migrations', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'migration.sql'), sql);
}

/** A repository whose main branch has one merged migration, checked out on a feature branch. */
function repo() {
  const cwd = mkdtempSync(join(tmpdir(), 'mig-guard-'));
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@point.test');
  git(cwd, 'config', 'user.name', 'test');
  git(cwd, 'config', 'core.autocrlf', 'false');
  write(cwd, '20261001000000_baseline', 'CREATE TABLE a (id int);\n');
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-q', '-m', 'chore(repo): baseline');
  git(cwd, 'switch', '-q', '-c', 'feature/add-x');
  return cwd;
}

function commit(cwd) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'feat(add-x): change');
}

// Each case builds a temporary Git repository; git on Windows can take several seconds.
describe('check-migrations (CG-DB-02)', { timeout: 30_000 }, () => {
  it('fails when a migration that exists on main is modified', () => {
    const cwd = repo();
    write(cwd, '20261001000000_baseline', 'CREATE TABLE a (id bigint);\n');
    commit(cwd);
    const problems = checkMigrations({ cwd, baseRef: 'main' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(
      /20261001000000_baseline\/migration\.sql: merged migration modified/,
    );
  });

  it('fails when a migration that exists on main is deleted', () => {
    const cwd = repo();
    rmSync(join(cwd, 'db', 'migrations', '20261001000000_baseline'), { recursive: true });
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/merged migration deleted/);
  });

  it.each([
    ['DROP TABLE', 'DROP TABLE a;'],
    ['DROP COLUMN', 'ALTER TABLE a DROP COLUMN id;'],
    ['RENAME', 'ALTER TABLE a RENAME TO b;'],
    ['ALTER COLUMN … TYPE', 'ALTER TABLE a ALTER COLUMN id TYPE bigint;'],
    ['ALTER COLUMN … SET DATA TYPE', 'ALTER TABLE a ALTER COLUMN id SET DATA TYPE bigint;'],
  ])('fails a new migration with %s', (_name, sql) => {
    const cwd = repo();
    write(cwd, '20261002000000_add_x', `${sql}\n`);
    commit(cwd);
    const problems = checkMigrations({ cwd, baseRef: 'main' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/destructive DDL/);
  });

  it('passes a new additive migration', () => {
    const cwd = repo();
    write(
      cwd,
      '20261002000000_add_x',
      'ALTER TABLE a ADD COLUMN note text;\nCREATE INDEX a_note ON a (note);\n',
    );
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })).toEqual([]);
  });

  it('ignores the words inside comments and string literals', () => {
    const cwd = repo();
    write(
      cwd,
      '20261002000000_add_x',
      "-- never DROP TABLE here\nCOMMENT ON TABLE a IS 'rename / reuse ✖';\n/* ALTER COLUMN id TYPE */\n",
    );
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })).toEqual([]);
  });

  it('also sees an uncommitted edit of a merged migration', () => {
    const cwd = repo();
    write(cwd, '20261001000000_baseline', 'CREATE TABLE a (id text);\n');
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/merged migration modified/);
  });
});
