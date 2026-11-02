import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// add-staging-deploy tasks 6.5–6.7 — the parts of infra/deploy/lib.sh that need no Docker: the
// configuration check of spec "The deploy checks the server configuration before it changes anything",
// the APP_VERSION rewrite of "The deploy runs the migrations before the new release starts" and the
// history that "Rollback starts an earlier release without migrating" reads. The whole scripts run
// against a real stack in CI job deploy-script. lib.sh is copied to <scratch>/infra/deploy, so its
// DEPLOY_ROOT is the scratch folder.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dir = mkdtempSync(join(tmpdir(), 'point-deploy-lib-'));
mkdirSync(join(dir, 'infra/deploy'), { recursive: true });
copyFileSync(join(root, 'infra/deploy/lib.sh'), join(dir, 'infra/deploy/lib.sh'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const bash = (script) => {
  const result = spawnSync(
    'bash',
    ['-c', `set -euo pipefail; source infra/deploy/lib.sh; ${script}`],
    {
      cwd: dir,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error(`bash exited ${result.status}: ${result.stderr}`);
  return result.stdout;
};
const lines = (text) => text.split('\n').filter((line) => line !== '');

const EXAMPLE = `# --- origins
# Public site origin.
SITE_ORIGIN=https://point.test
# Staff app origin.
APP_ORIGIN=https://app.point.test

# --- error reporting
# DSN of point-api.
SENTRY_DSN_API=
# DSN of point-web.
SENTRY_DSN_WEB=
# connect-src origin.
CADDY_CSP_CONNECT=

# --- backup bucket
# reserved: add-backup-restore reads S3_BUCKET_BACKUP and the BACKUP_S3_* keys
# Bucket for database backups.
S3_BUCKET_BACKUP=
# Access key.
BACKUP_S3_ACCESS_KEY_ID=

# --- release
# Release tag.
APP_VERSION=0.0.0-dev
`;

const check = (env) => {
  writeFileSync(join(dir, 'example'), EXAMPLE);
  writeFileSync(join(dir, 'server.env'), env);
  return lines(bash('config_problems example server.env'));
};
const GOOD = `SITE_ORIGIN=https://point.example
APP_ORIGIN=https://app.point.example
SENTRY_DSN_API=https://k@o0.ingest.sentry.io/1
SENTRY_DSN_WEB=https://public@o0.ingest.sentry.io/2
CADDY_CSP_CONNECT=https://o0.ingest.sentry.io
APP_VERSION=v0.1.0
`;

describe('config_problems (task 6.5 · spec "The deploy checks the server configuration…")', () => {
  it('a server .env that fits the release has no problem; reserved variables are not required', () => {
    expect(check(GOOD)).toStrictEqual([]);
  });

  it('Scenario: A release that needs a new variable — missing in .env: SENTRY_DSN_API', () => {
    expect(check(GOOD.replace(/^SENTRY_DSN_API=.*\n/m, ''))).toStrictEqual([
      'missing in .env: SENTRY_DSN_API',
    ]);
  });

  it('Scenario: The policy would block the error reports — CADDY_CSP_CONNECT must be the DSN origin', () => {
    expect(check(GOOD.replace(/^CADDY_CSP_CONNECT=.*$/m, 'CADDY_CSP_CONNECT='))).toStrictEqual([
      'CADDY_CSP_CONNECT must be https://o0.ingest.sentry.io',
    ]);
  });

  it('both empty is allowed; a connect origin without a web DSN is not', () => {
    const off = GOOD.replace(/^SENTRY_DSN_WEB=.*$/m, 'SENTRY_DSN_WEB=');
    expect(check(off.replace(/^CADDY_CSP_CONNECT=.*$/m, 'CADDY_CSP_CONNECT='))).toStrictEqual([]);
    expect(check(off)).toStrictEqual([
      'CADDY_CSP_CONNECT must be empty while SENTRY_DSN_WEB is empty',
    ]);
  });

  it('a value that still holds change-me is named; every problem is listed, one per line', () => {
    const env = `${GOOD.replace(/^APP_ORIGIN=.*\n/m, '').replace(/^SENTRY_DSN_API=.*$/m, 'SENTRY_DSN_API=change-me')}`;
    expect(check(env)).toStrictEqual([
      'missing in .env: APP_ORIGIN',
      'change-me in .env: SENTRY_DSN_API',
    ]);
  });

  it('quoted values and CRLF line ends are read as Compose reads them', () => {
    const env = GOOD.replace(
      /^CADDY_CSP_CONNECT=.*$/m,
      'CADDY_CSP_CONNECT="https://o0.ingest.sentry.io"',
    ).replace(/\n/g, '\r\n');
    expect(check(env)).toStrictEqual([]);
  });
});

describe('origin_of', () => {
  it.each([
    ['https://public@o0.ingest.sentry.io/2', 'https://o0.ingest.sentry.io'],
    ['https://o0.ingest.sentry.io/2', 'https://o0.ingest.sentry.io'],
    ['https://public@sentry.example:8443/5', 'https://sentry.example:8443'],
    ['', ''],
  ])('%j → %j', (url, origin) => {
    expect(bash(`origin_of '${url}'`)).toBe(origin);
  });
});

describe('set_app_version (task 6.5)', () => {
  it('rewrites only the APP_VERSION line of .env', () => {
    const before = `${GOOD}# APP_VERSION=keep this comment\nOTHER=APP_VERSION=v0.0.1\n`;
    writeFileSync(join(dir, '.env'), before);
    bash('set_app_version v0.2.0');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe(
      before.replace('APP_VERSION=v0.1.0', 'APP_VERSION=v0.2.0'),
    );
  });
});

describe('the deploy history (tasks 6.6 / 6.7)', () => {
  beforeEach(() => {
    writeFileSync(
      join(dir, 'deploy-history.log'),
      [
        '2026-10-05T21:00:10+06:30 deploy v0.1.0 ok',
        '2026-10-05T21:30:40+06:30 deploy v0.2.0 failed',
        '2026-10-05T21:34:02+06:30 deploy v0.2.0 ok',
        '2026-10-12T21:10:00+06:30 deploy v0.3.0 ok',
        '2026-10-12T21:20:00+06:30 rollback v0.2.0 ok',
        '2026-10-19T21:05:00+06:30 deploy v0.4.0 failed',
        '',
      ].join('\n'),
    );
  });

  it('ok_tags lists each tag deployed or rolled back to ok once, newest last', () => {
    expect(lines(bash('ok_tags'))).toStrictEqual(['v0.1.0', 'v0.3.0', 'v0.2.0']);
  });

  it('Scenario: An unknown tag is refused — only a tag with an ok line was deployed here', () => {
    expect(bash('was_deployed_ok v0.1.0 && echo yes || echo no')).toBe('yes\n');
    expect(bash('was_deployed_ok v0.0.9 && echo yes || echo no')).toBe('no\n');
    expect(bash('was_deployed_ok v0.4.0 && echo yes || echo no')).toBe('no\n');
    expect(bash('was_deployed_ok v0.1 && echo yes || echo no')).toBe('no\n');
  });

  it('history_line appends <time MMT> <action> <tag> <result>', () => {
    bash('history_line deploy v0.5.0 ok');
    const last = readFileSync(join(dir, 'deploy-history.log'), 'utf8').trimEnd().split('\n').at(-1);
    expect(last).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+06:30 deploy v0\.5\.0 ok$/);
  });
});

describe('resolve_arg', () => {
  it.each([
    ['https://app.point.test', 'app.point.test:443:127.0.0.1'],
    ['https://point.test/', 'point.test:443:127.0.0.1'],
    ['https://point.test:8443', 'point.test:8443:127.0.0.1'],
  ])('%s → %s', (origin, arg) => {
    expect(bash(`resolve_arg '${origin}'`)).toBe(`${arg}\n`);
  });
});
