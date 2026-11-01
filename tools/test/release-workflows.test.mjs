import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// add-staging-deploy task 6.3 — platform-runtime spec "Only a release tag on main whose CI passed is
// published", scenario "Pull requests never reach the server" (design D4): the workflows that hold the
// `pilot` environment (release with its deploy job, rollback) start only from a tag push or by hand.
// The check is on the text: the trigger names may not appear outside a comment at all, so neither the
// mapping form (`pull_request:`) nor the list form (`on: [push, pull_request]`) can slip through.

const workflows = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  '.github/workflows',
);
const read = (file) => readFileSync(join(workflows, file), 'utf8');
const code = (text) =>
  text
    .split('\n')
    .map((line) => line.replace(/(^|\s)#.*$/, ''))
    .join('\n');

describe('release, deploy and rollback workflows (task 6.3)', () => {
  it.each(['release.yml', 'rollback.yml'])(
    'Scenario: Pull requests never reach the server — %s has no pull_request trigger',
    (file) => {
      expect(code(read(file))).not.toMatch(/pull_request/);
    },
  );

  it('every workflow that uses the pilot environment is one of the two', () => {
    // `environment: pilot`, or the mapping form `environment:` with `name: pilot` under it.
    const usesPilot = (text) =>
      /^\s*environment:\s*pilot\s*$/m.test(text) ||
      /^(\s*)environment:\s*\n(?:\1\s+.*\n)*?\1\s+name:\s*pilot\s*$/m.test(text);
    const pilot = readdirSync(workflows)
      .filter((file) => /\.ya?ml$/.test(file))
      .filter((file) => usesPilot(code(read(file))));
    expect(pilot.sort()).toStrictEqual(['release.yml', 'rollback.yml']);
    expect(usesPilot('jobs:\n  x:\n    environment:\n      url: u\n      name: pilot\n')).toBe(
      true,
    );
  });

  it('release.yml starts only from a release tag push', () => {
    const text = code(read('release.yml'));
    expect(text).toMatch(/^on:\n {2}push:\n {4}tags: \['v\*\.\*\.\*'\]\n\n/m);
    expect(text).not.toMatch(/branches:|workflow_dispatch|workflow_run|schedule/);
  });

  it('rollback.yml starts only by hand', () => {
    const text = code(read('rollback.yml'));
    expect(text).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(text).not.toMatch(/^\s*(push|workflow_run|schedule):/m);
  });

  it('the deploy and rollback jobs share one group that never cancels the running one, with a timeout', () => {
    for (const file of ['release.yml', 'rollback.yml']) {
      const text = code(read(file));
      // On the job, not the workflow, so building images never blocks a rollback.
      expect(text).not.toMatch(/^concurrency:/m);
      expect(text).toMatch(
        / {4}concurrency:\n {6}group: pilot-deploy\n {6}cancel-in-progress: false/,
      );
      expect(text).toMatch(/ {4}environment: pilot\n/);
      expect(text).toMatch(/ {4}timeout-minutes: \d+\n/);
    }
  });
});
