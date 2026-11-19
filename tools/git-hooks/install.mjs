// Installs the Git hooks from the `prepare` script (design D19): points core.hooksPath at
// .githooks/. Does nothing outside a Git work tree (Docker builds, CI tarballs).
import { spawnSync } from 'node:child_process';

const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
  console.log('git hooks: not a Git work tree — skipped');
  process.exit(0);
}
const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (set.status !== 0) process.exit(set.status ?? 1);
console.log('git hooks: core.hooksPath = .githooks');
