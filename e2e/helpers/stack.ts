import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlaywrightWorkerArgs } from '@playwright/test';

import { APP_ORIGIN, COMPOSE, environmentWith } from '../hosts.js';

// The Compose stack under test (design D15 · add-foundation-auth-access D5): a Compose command, one SQL
// statement as the database owner inside the postgres container, and the api restart that empties the
// in-process rate limiter between spec files that request codes.

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const compose = (args: string, input?: string): string =>
  execSync(`${COMPOSE} ${args}`, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  });

/**
 * SQL as the owner role (POSTGRES_USER) inside the postgres container, on stdin — test set-up only,
 * e.g. a session an admin revoked. Returns psql's unaligned output.
 */
export const sql = (statements: string): string =>
  compose(
    `exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At'`,
    statements,
  );

/**
 * Restarts the api container and waits for health ok through the staff host. The rate limiter lives
 * in the api process (design D5), so a restart starts every spec file that requests codes with empty
 * buckets — 10 code requests and 10 verifies per hour per IP, and the runner has one IP.
 */
export async function restartApi(playwright: PlaywrightWorkerArgs['playwright']): Promise<void> {
  compose('restart api');
  const context = await playwright.request.newContext({
    baseURL: APP_ORIGIN,
    ignoreHTTPSErrors: true,
  });
  try {
    for (let i = 0; i < 90; i += 1) {
      const res = await context.get('/api/v1/health').catch(() => null);
      if (res?.status() === 200) return;
      await new Promise((done) => setTimeout(done, 1000));
    }
    throw new Error('api did not answer health ok after the restart');
  } finally {
    await context.dispose();
  }
}

/**
 * Recreates one service with some variables replaced (a shell variable wins over .env in Compose)
 * and waits until `ready` answers 200 through the edge — then runs `body` and puts the service back
 * as .env has it. For the cases of add-staging-deploy that need another value of one variable: an
 * empty CADDY_CSP_CONNECT (D8), an empty SENTRY_DSN_WEB (D10).
 */
export async function withServiceEnv(
  playwright: PlaywrightWorkerArgs['playwright'],
  service: string,
  overrides: Readonly<Record<string, string>>,
  ready: string,
  body: () => Promise<void>,
): Promise<void> {
  const up = (env: Readonly<Record<string, string>>) =>
    execSync(`${COMPOSE} up -d ${service}`, {
      cwd: repoRoot,
      env: environmentWith(env),
      stdio: 'ignore',
    });
  const context = await playwright.request.newContext({ ignoreHTTPSErrors: true });
  const waitReady = async () => {
    for (let i = 0; i < 90; i += 1) {
      const res = await context.get(ready).catch(() => null);
      if (res?.status() === 200) return;
      await new Promise((done) => setTimeout(done, 1000));
    }
    throw new Error(`${ready} did not answer 200 after ${service} was recreated`);
  };
  try {
    up(overrides);
    await waitReady();
    await body();
  } finally {
    up({});
    await waitReady();
    await context.dispose();
  }
}
