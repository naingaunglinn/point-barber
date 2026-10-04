// Claude Code after-edit hook (design D17 · CG-AI-08), registered in .claude/settings.json for
// the Edit and Write tools. For the one edited file:
//   1. a file outside apps/, packages/, tools/, e2e/, db/scripts/ is left alone;
//   2. Prettier formats the file, then ESLint lints it;
//   3. tsc --noEmit --incremental checks the workspace that owns it;
//   4. vitest related <file> --run runs the unit tests of that workspace that import it.
// Integration tests, database tests and Playwright never run here. A failure goes to stderr with
// exit code 2, which Claude Code shows to Claude. Every tool is started with this Node binary, never
// through a shell, so the hook behaves the same on Windows and Linux.
// By hand: node tools/claude-hooks/after-edit.mjs <file>. Claude Code sends its payload on stdin.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { filePathOf, planFor } from './lib/plan.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STEP_TIMEOUT_MS = 120_000;
const MAX_LINES = 60;

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

/** The script of a package's bin, from the workspace's node_modules or the root's — or null. */
function binOf(pkg, name, workspaceDir) {
  for (const dir of new Set([workspaceDir, ROOT])) {
    const manifest = join(dir, 'node_modules', pkg, 'package.json');
    if (!existsSync(manifest)) continue;
    const { bin } = JSON.parse(readFileSync(manifest, 'utf8'));
    return join(dirname(manifest), typeof bin === 'string' ? bin : bin[name]);
  }
  return null;
}

function run(label, script, args) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    maxBuffer: 64 * 1024 * 1024,
    timeout: STEP_TIMEOUT_MS,
  });
  const seconds = (performance.now() - started) / 1000;
  let reason = `exit ${result.status}`;
  if (result.error !== undefined) reason = result.error.message;
  else if (result.signal !== null) reason = `stopped by ${result.signal}`;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return { label, ok: result.status === 0, seconds, reason, output };
}

function trimmed(output) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= MAX_LINES) return output;
  return [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines`].join('\n');
}

let file = process.argv[2] === undefined ? null : resolve(process.argv[2]);
if (file === null) {
  try {
    file = filePathOf(await readStdin());
  } catch (error) {
    console.error(`after-edit: the hook payload is not JSON — ${String(error)}`);
    process.exit(1);
  }
}
const plan = file === null ? null : planFor(ROOT, file);
if (plan === null) process.exit(0);

const target = join(ROOT, plan.rel);
const workspaceDir = plan.workspace === null ? ROOT : join(ROOT, plan.workspace);
// { label = the bin name, package, arguments } in the order of D17.
const steps = [
  {
    label: 'prettier',
    pkg: 'prettier',
    args: ['--write', '--ignore-unknown', '--log-level', 'warn', target],
  },
];
if (plan.eslint) {
  steps.push({ label: 'eslint', pkg: 'eslint', args: ['--no-warn-ignored', target] });
}
if (plan.tsconfig !== null) {
  const args = ['--noEmit', '--incremental', '--pretty', 'false', '-p', plan.tsconfig];
  steps.push({ label: 'tsc', pkg: 'typescript', args });
}
if (plan.vitestProject !== null) {
  const args = ['related', target, '--run', '--project', plan.vitestProject];
  steps.push({
    label: 'vitest',
    pkg: 'vitest',
    args: [...args, '--passWithNoTests', '--reporter', 'agent'],
  });
}

const results = [];
for (const { label, pkg, args } of steps) {
  const script = binOf(pkg, label, workspaceDir);
  if (script === null) {
    console.error(`after-edit: ${pkg} is not installed — run pnpm install`);
    process.exit(1);
  }
  results.push(run(label, script, args));
}

const total = results.reduce((sum, step) => sum + step.seconds, 0);
const timings = results.map((s) => `${s.label} ${s.seconds.toFixed(1)} s${s.ok ? '' : ' FAILED'}`);
const summary = `after-edit: ${plan.rel} — ${timings.join(' · ')} · total ${total.toFixed(1)} s`;
const failed = results.filter((step) => !step.ok);
if (failed.length === 0) {
  console.log(summary);
  process.exit(0);
}
console.error(summary);
for (const step of failed) {
  console.error(`\n── ${step.label} (${step.reason}) ──\n${trimmed(step.output)}`);
}
console.error(
  '\nFix the problems above; never weaken a rule, a type or a test to pass (CG-AI-06).',
);
process.exit(2);
