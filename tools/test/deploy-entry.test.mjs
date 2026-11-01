import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

// add-staging-deploy task 6.4 — platform-runtime spec "The deploy key runs only the deploy and
// rollback commands" (design D5). entry.sh runs from a scratch folder next to stand-in deploy.sh and
// rollback.sh scripts that only record their arguments, so nothing real is deployed.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = mkdtempSync(join(tmpdir(), 'point-entry-'));
const calls = join(dir, 'calls.log');
copyFileSync(join(root, 'infra/deploy/entry.sh'), join(dir, 'entry.sh'));
for (const command of ['deploy', 'rollback']) {
  writeFileSync(
    join(dir, `${command}.sh`),
    `#!/usr/bin/env bash\necho "${command} $*" >> "$(dirname "$0")/calls.log"\n`,
  );
}
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (command) => {
  writeFileSync(calls, '');
  const env = { ...process.env };
  if (command === undefined) delete env.SSH_ORIGINAL_COMMAND;
  else env.SSH_ORIGINAL_COMMAND = command;
  const result = spawnSync('bash', [join(dir, 'entry.sh')], { env, encoding: 'utf8' });
  return {
    status: result.status,
    stderr: result.stderr.trim(),
    calls: readFileSync(calls, 'utf8'),
  };
};

describe('infra/deploy/entry.sh (task 6.4)', () => {
  it('Scenario: A valid command — deploy v0.2.0 runs the deploy command for v0.2.0', () => {
    expect(run('deploy v0.2.0')).toStrictEqual({ status: 0, stderr: '', calls: 'deploy v0.2.0\n' });
  });

  it('rollback v0.1.0 runs the rollback command for v0.1.0', () => {
    expect(run('rollback v0.1.0')).toStrictEqual({
      status: 0,
      stderr: '',
      calls: 'rollback v0.1.0\n',
    });
  });

  it.each([
    'deploy v0.2.0; cat .env',
    'ls',
    'deploy main',
    // And the near misses.
    'deploy v0.2.0\ncat .env',
    'deploy v0.2.0 ',
    ' deploy v0.2.0',
    'deploy  v0.2.0',
    'deploy v0.2',
    'deploy v0.2.0-rc.1',
    'deploy $(cat .env)',
    'deploy `id`',
    'migrate v0.2.0',
    'rollback',
    '',
  ])(
    'Scenario: Anything else is refused — %j exits 1 with "refused" and runs nothing',
    (command) => {
      expect(run(command)).toStrictEqual({ status: 1, stderr: 'refused', calls: '' });
    },
  );

  it('a login without a command (no SSH_ORIGINAL_COMMAND) is refused', () => {
    expect(run(undefined)).toStrictEqual({ status: 1, stderr: 'refused', calls: '' });
  });
});
