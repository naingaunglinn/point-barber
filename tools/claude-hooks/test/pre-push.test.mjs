import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// Technical guarantee, no spec scenario: the fallback of design D17 (task 7.7) — the typecheck and
// the unit tests that left the after-edit hook run before every push.
describe('.githooks/pre-push (design D17 · task 7.7)', () => {
  it('is committed executable, because Git on Linux and macOS skips a hook that is not', () => {
    const { stdout } = spawnSync('git', ['ls-files', '--stage', '.githooks/pre-push'], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(stdout).toMatch(/^100755 /);
  });

  // Read, not run: Git for Windows runs the hook with its own sh, which a test on Windows cannot
  // count on finding on PATH.
  it('skips a push that only deletes branches; otherwise runs the typecheck, then the unit tests, and stops at the first failure', () => {
    const lines = readFileSync(join(repo, '.githooks/pre-push'), 'utf8').split('\n');
    expect(lines[0]).toBe('#!/bin/sh');
    const commands = lines.filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(commands).toEqual([
      'set -e',
      'commits=no',
      'while read -r _local_ref local_sha _remote_ref _remote_sha; do',
      '  case $local_sha in *[!0]*) commits=yes ;; esac',
      'done',
      '[ "$commits" = yes ] || exit 0',
      'pnpm run typecheck',
      'pnpm run test',
    ]);
  });
});
