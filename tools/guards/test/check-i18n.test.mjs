import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const guard = join(repo, 'tools/guards/check-i18n.mjs');
const MESSAGES = 'packages/i18n/messages';
const CONSTANTS = 'packages/shared/src/constants';
const STATUS_MAP = 'packages/ui/src/status/status-map.ts';
const roots = [];

/** A temporary tree with this repository's language files and the two constant files. */
function copyOfRepo() {
  const root = mkdtempSync(join(tmpdir(), 'check-i18n-'));
  roots.push(root);
  cpSync(join(repo, MESSAGES), join(root, MESSAGES), { recursive: true });
  mkdirSync(join(root, CONSTANTS), { recursive: true });
  for (const name of ['status.ts', 'error-codes.ts']) {
    cpSync(join(repo, CONSTANTS, name), join(root, CONSTANTS, name));
  }
  return root;
}

/** Applies `change` to the parsed JSON file `<lang>/<namespace>.json` of the tree. */
function edit(root, lang, namespace, change) {
  const path = join(root, MESSAGES, lang, `${namespace}.json`);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  change(json);
  writeFileSync(path, JSON.stringify(json, null, 2));
}

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function run(root) {
  const args = root === undefined ? [guard] : [guard, `--root=${root}`];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// add-shared-ui-components · ui-foundation "Every visible string comes from the my and en language
// files with checked keys" (D-PLT-03 · AD-L10N-01 · AD-L10N-02 · AD-IMPL-05 · design D6).
describe('check-i18n (pnpm i18n:check)', () => {
  it('Scenario: Complete files pass — the language files of this repository', () => {
    const { status, output } = run();
    expect(status).toBe(0);
    expect(output).toMatch(/check-i18n: ok — \d+ keys in my and en/);
  });

  it('Scenario: A key missing in Myanmar fails the check', () => {
    const root = copyOfRepo();
    edit(root, 'my', 'common', (json) => delete json.action.retry);
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('my: missing common.action.retry');
    expect(output).not.toContain('en: missing');
  });

  it('Scenario: A status without a label fails the check', () => {
    const root = copyOfRepo();
    edit(root, 'en', 'status', (json) => delete json.visits.COMPLETED);
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('en: missing status.visits.COMPLETED');
  });

  it('fails on a status constant with no label in either language', () => {
    const root = copyOfRepo();
    for (const lang of ['my', 'en']) edit(root, lang, 'status', (json) => delete json.sales.OPEN);
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('my: missing status.sales.OPEN');
    expect(output).toContain('en: missing status.sales.OPEN');
  });

  it('fails on an error code with no key — API, field and client-only codes', () => {
    const root = copyOfRepo();
    for (const lang of ['my', 'en']) {
      edit(root, lang, 'error', (json) => {
        delete json.phone_invalid;
        delete json.too_big;
        delete json.date_invalid;
      });
    }
    const { status, output } = run(root);
    expect(status).toBe(1);
    for (const lang of ['my', 'en']) {
      for (const code of ['phone_invalid', 'too_big', 'date_invalid']) {
        expect(output).toContain(`${lang}: missing error.${code}`);
      }
    }
  });

  it('fails on an empty value, and on a value that is only spaces', () => {
    const root = copyOfRepo();
    edit(root, 'en', 'reason', (json) => (json.FORGOT = ''));
    edit(root, 'my', 'common', (json) => (json.search.placeholder = '  '));
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('en: empty reason.FORGOT');
    expect(output).toContain('my: empty common.search.placeholder');
  });

  it('fails on a namespace file that exists in one language only', () => {
    const root = copyOfRepo();
    write(root, `${MESSAGES}/en/pos.json`, JSON.stringify({ title: 'Checkout' }));
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('my: missing pos.title');
  });

  it('fails on a file that is not valid JSON', () => {
    const root = copyOfRepo();
    write(root, `${MESSAGES}/my/reason.json`, '{ "FORGOT": ');
    const { status, output } = run(root);
    expect(status).toBe(1);
    expect(output).toContain('my: cannot read reason.json');
  });

  it('prints one line per finding and no line twice', () => {
    const root = copyOfRepo();
    edit(root, 'my', 'common', (json) => {
      delete json.action.retry;
      delete json.action.save;
    });
    const lines = run(root).output.trim().split('\n');
    expect(lines.filter((line) => line === 'my: missing common.action.retry')).toHaveLength(1);
    expect(lines.filter((line) => line === 'my: missing common.action.save')).toHaveLength(1);
  });

  describe('with the status map (task 7.8)', () => {
    const MAP = `export const DERIVED_STATES = {
  payments: { VOIDED: { tone: 'muted' } },
  daily_closings: { OPEN_PAST: { tone: 'warning' } },
} as const;
export const FLAGS = {
  late_entry: { tone: 'warning', icon: 'clock' },
  reopened: { tone: 'neutral', icon: 'rotate-ccw' },
} as const;
`;

    it('passes when every derived state and flag has its label', () => {
      const root = copyOfRepo();
      write(root, STATUS_MAP, MAP);
      const { status, output } = run(root);
      expect(status).toBe(0);
      expect(output).not.toContain('status map not found');
    });

    it('fails on a derived state without a label', () => {
      const root = copyOfRepo();
      write(root, STATUS_MAP, MAP);
      edit(root, 'en', 'status', (json) => delete json.daily_closings.OPEN_PAST);
      const { status, output } = run(root);
      expect(status).toBe(1);
      expect(output).toContain('en: missing status.daily_closings.OPEN_PAST');
    });

    it('fails on a flag without a label', () => {
      const root = copyOfRepo();
      write(root, STATUS_MAP, MAP.replace('late_entry: {', 'late_entry: {}, overtime: {'));
      const { status, output } = run(root);
      expect(status).toBe(1);
      expect(output).toContain('my: missing status.flag.overtime');
      expect(output).toContain('en: missing status.flag.overtime');
    });

    it('says so when the map does not exist yet', () => {
      const { status, output } = run(copyOfRepo());
      expect(status).toBe(0);
      expect(output).toContain('status map not found');
    });
  });
});
