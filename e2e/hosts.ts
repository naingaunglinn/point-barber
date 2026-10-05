// The two hosts of the stack under test (design D12). The defaults are the local origins of
// docker-compose.dev.yml, reached through the hosts-file line of docs/engineering/local-setup.md.
// The e2e workspace reads only these E2E_* variables.
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

export const SITE_HOST = new URL(SITE_ORIGIN).host;
export const APP_HOST = new URL(APP_ORIGIN).host;
