// The two hosts of the stack under test (design D12). The defaults are the local origins of
// docker-compose.dev.yml, reached through the hosts-file line of docs/engineering/local-setup.md.
// The e2e workspace reads its environment only here: the E2E_* variables and CI.
const env = (name: string, fallback: string): string => {
  // This file is the e2e workspace's one environment reader.
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};

/** Public host: the website. */
export const SITE_ORIGIN = env('E2E_SITE_ORIGIN', 'https://point.test');
/** Staff host: the staff app. */
export const APP_ORIGIN = env('E2E_APP_ORIGIN', 'https://app.point.test');
/** Where the edge listens, for raw requests that bypass name resolution. */
export const EDGE_ADDRESS = env('E2E_EDGE_ADDRESS', '127.0.0.1');
/** The Compose command that runs the stack (docker compose -f … -f …), for the stop/start cases. */
export const COMPOSE = env(
  'E2E_COMPOSE',
  'docker compose -f docker-compose.yml -f docker-compose.dev.yml',
);

/** Mailpit's API, where the sign-in codes arrive outside production (ADR-007 · docker-compose.dev.yml). */
export const MAILPIT_URL = env('E2E_MAILPIT_URL', 'http://localhost:8025');

/** Running in CI (GitHub Actions sets CI=true): stricter Playwright settings and an HTML report. */
export const IS_CI = env('CI', '') !== '';

export const SITE_HOST = new URL(SITE_ORIGIN).host;
export const APP_HOST = new URL(APP_ORIGIN).host;

/**
 * The runner's environment with some variables replaced — for a Compose command that must see
 * another value than .env has (a shell variable wins over .env).
 */
export const environmentWith = (
  overrides: Readonly<Record<string, string>>,
): Record<string, string | undefined> => ({ ...process.env, ...overrides });
