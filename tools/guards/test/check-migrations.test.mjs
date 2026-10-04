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
  writeFileSync(join(cwd, 'db', 'migrations', 'migration_lock.toml'), 'provider = "postgresql"\n');
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
      /20261001000000_baseline\/migration\.sql: merged migration file modified/,
    );
  });

  it('fails when a migration that exists on main is deleted', () => {
    const cwd = repo();
    rmSync(join(cwd, 'db', 'migrations', '20261001000000_baseline'), { recursive: true });
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/merged migration file deleted/);
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

  // Review #1 — PostgreSQL makes COLUMN optional in DROP [COLUMN] and ALTER [COLUMN] … TYPE.
  it.each([
    'ALTER TABLE customers DROP notes;',
    'ALTER TABLE customers DROP IF EXISTS notes;',
    'ALTER TABLE a ADD COLUMN extra text, DROP note;',
    'ALTER TABLE customers ALTER phone TYPE varchar(20);',
    'ALTER TABLE a ALTER id SET DATA TYPE smallint;',
  ])('fails %s (COLUMN keyword omitted)', (sql) => {
    const cwd = repo();
    write(cwd, '20261002000000_add_x', `${sql}\n`);
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/destructive DDL/);
  });

  it.each([
    'ALTER TABLE a DROP CONSTRAINT a_chk;',
    'ALTER TABLE a ALTER COLUMN b DROP DEFAULT;',
    'ALTER TABLE a ALTER COLUMN b DROP NOT NULL;',
    'ALTER TABLE a ALTER b DROP IDENTITY;',
    'ALTER TABLE a ALTER b DROP EXPRESSION;',
    'ALTER TABLE a ADD COLUMN type_code smallint;',
  ])('passes the non-destructive %s', (sql) => {
    const cwd = repo();
    write(cwd, '20261002000000_add_x', `${sql}\n`);
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })).toEqual([]);
  });

  // Review #8 — dollar quotes and dynamic DDL.
  it('is not thrown off by an apostrophe inside a dollar-quoted string', () => {
    const cwd = repo();
    write(
      cwd,
      '20261002000000_add_x',
      "COMMENT ON TABLE a IS $$owner's$$;\nALTER TABLE a DROP note;\n",
    );
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/destructive DDL/);
  });

  it('fails destructive DDL built inside a DO block', () => {
    const cwd = repo();
    write(
      cwd,
      '20261002000000_add_x',
      "DO $$ BEGIN EXECUTE format('ALTER TABLE %I DROP COLUMN %I', 'a', 'note'); END $$;\n",
    );
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/destructive DDL/);
  });

  it('passes the time-zone preamble DO block of the baseline', () => {
    const cwd = repo();
    write(
      cwd,
      '20261002000000_add_x',
      "DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Yangon'); END $$;\n",
    );
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })).toEqual([]);
  });

  // Review #9 — every tracked file under db/migrations/, not only migration.sql.
  it('fails when migration_lock.toml from main is modified', () => {
    const cwd = repo();
    writeFileSync(join(cwd, 'db', 'migrations', 'migration_lock.toml'), 'provider = "mysql"\n');
    commit(cwd);
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(
      /migration_lock\.toml: merged migration file modified/,
    );
  });

  // Review #4 — nothing compared must not read as ok.
  it('fails when no base ref can be resolved', () => {
    const cwd = repo();
    expect(() => checkMigrations({ cwd, baseRef: 'origin/does-not-exist' })).toThrow(/no base ref/);
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
    expect(checkMigrations({ cwd, baseRef: 'main' })[0]).toMatch(/merged migration file modified/);
  });
});
