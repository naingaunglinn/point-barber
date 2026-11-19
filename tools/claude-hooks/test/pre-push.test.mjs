import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hook = join(repo, '.githooks/pre-push');
const ZERO = '0'.repeat(40);
const TYPECHECK = 'pnpm run typecheck';
const FULL = 'pnpm run test';
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Hook Test',
  GIT_AUTHOR_EMAIL: 'hook-test@example.com',
  GIT_COMMITTER_NAME: 'Hook Test',
  GIT_COMMITTER_EMAIL: 'hook-test@example.com',
};

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const sandboxes = [];
afterEach(() => {
  for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A throw-away repository: its first commit is `origin/main`, and `files` are added in a second
// commit, the one being pushed. `pnpm` is a stub that writes each call to a log.
function sandbox(files) {
  const dir = mkdtempSync(join(tmpdir(), 'pre-push-'));
  sandboxes.push(dir);
  git(dir, 'init', '-q', '-b', 'work');
  writeFileSync(join(dir, 'README.md'), 'base\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'change');
  const bin = mkdtempSync(join(tmpdir(), 'pre-push-bin-'));
  sandboxes.push(bin);
  writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\necho "pnpm $*" >> "$PNPM_LOG"\n');
  chmodSync(join(bin, 'pnpm'), 0o755);
  return { dir, bin, sha: git(dir, 'rev-parse', 'HEAD') };
}

// Runs the committed hook with Git's stdin line and returns the pnpm calls it made.
function push(box, line) {
  const log = join(box.bin, 'pnpm.log');
  const result = spawnSync('sh', [hook], {
    cwd: box.dir,
    input: `${line}\n`,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${box.bin}:${process.env.PATH ?? ''}`, PNPM_LOG: log },
  });
  let calls = [];
  try {
    calls = readFileSync(log, 'utf8').trim().split('\n').filter(Boolean);
  } catch {
    calls = [];
  }
  return { status: result.status, calls };
}

const branch = (box) => `refs/heads/work ${box.sha} refs/heads/work ${ZERO}`;

// Technical guarantee, no spec scenario: the pre-push check of design D17 (task 7.7), narrowed to the
// tests related to the change by the owner's decision of 18/Nov/2026 (point-sdd #40, 6967910510 item 5).
// CI's `static` and `unit` jobs still run everything.
describe('.githooks/pre-push (design D17 · task 7.7 · owner 18/Nov/2026)', () => {
  it('is committed executable, because Git on Linux and macOS skips a hook that is not', () => {
    const { stdout } = spawnSync('git', ['ls-files', '--stage', '.githooks/pre-push'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(stdout).toMatch(/^100755 /);
  });

  // Run, not read: the hook needs `sh`, which Git for Windows brings but a test on Windows cannot
  // count on finding on PATH, so these cases run on Linux and macOS (CI is Linux).
  describe.skipIf(process.platform === 'win32')('which checks a push runs', () => {
    it('a push that only deletes a branch runs nothing', () => {
      const box = sandbox({ 'a.ts': 'export const a = 1;\n' });
      expect(push(box, `(delete) ${ZERO} refs/heads/old ${box.sha}`)).toEqual({
        status: 0,
        calls: [],
      });
    });

    it('changed source files run the typecheck, then only the tests related to them', () => {
      const box = sandbox({
        'packages/shared/src/time/day.ts': 'export const day = 1;\n',
        'apps/web/lib/x.tsx': 'export const X = 1;\n',
      });
      expect(push(box, branch(box))).toEqual({
        status: 0,
        calls: [
          TYPECHECK,
          'pnpm exec vitest related --run --passWithNoTests apps/web/lib/x.tsx packages/shared/src/time/day.ts',
        ],
      });
    });

    it('JSON and Markdown only run the typecheck; CI runs the tests that read them', () => {
      const box = sandbox({
        'packages/i18n/messages/en/error.json': '{}\n',
        'docs/notes.md': 'text\n',
      });
      expect(push(box, branch(box))).toEqual({ status: 0, calls: [TYPECHECK] });
    });

    it.each([
      ['a TypeScript setting', 'tsconfig.base.json'],
      ['the lockfile', 'pnpm-lock.yaml'],
      ['a Vitest setting', 'apps/api/vitest.int.config.ts'],
      ['the hook itself', '.githooks/pre-push'],
      ['a tool its tests read from disk', 'tools/guards/check-example.mjs'],
    ])('%s runs the full suite', (_what, path) => {
      const box = sandbox({ [path]: 'x\n' });
      expect(push(box, branch(box))).toEqual({ status: 0, calls: [TYPECHECK, FULL] });
    });

    it('without a merge base with origin/main, the full suite runs', () => {
      const box = sandbox({ 'a.ts': 'export const a = 1;\n' });
      git(box.dir, 'update-ref', '-d', 'refs/remotes/origin/main');
      expect(push(box, branch(box))).toEqual({ status: 0, calls: [TYPECHECK, FULL] });
    });

    it('a failing typecheck stops the push before any test runs', () => {
      const box = sandbox({ 'a.ts': 'export const a = 1;\n' });
      writeFileSync(
        join(box.bin, 'pnpm'),
        '#!/bin/sh\necho "pnpm $*" >> "$PNPM_LOG"\n[ "$2" = typecheck ] && exit 1\nexit 0\n',
      );
      const result = push(box, branch(box));
      expect(result.status).not.toBe(0);
      expect(result.calls).toEqual([TYPECHECK]);
    });
  });
});
