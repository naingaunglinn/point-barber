import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// add-staging-deploy task 2.2 — platform-runtime spec "Only Caddy is reachable from outside the
// server stack" (design D3): the server stack is docker-compose.yml + docker-compose.staging.yml,
// rendered with .env.example's names and the `tools` profile (migrate). `docker compose config` needs
// the Compose CLI, not a daemon.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const rendered = JSON.parse(
  execFileSync(
    'docker',
    [
      'compose',
      '--env-file',
      '.env.example',
      '-f',
      'docker-compose.yml',
      '-f',
      'docker-compose.staging.yml',
      '--profile',
      'tools',
      'config',
      '--format',
      'json',
    ],
    { cwd: root, encoding: 'utf8', env: { ...process.env, IMAGE_PREFIX: 'ghcr.io/owner/' } },
  ),
);

const published = (service) =>
  (rendered.services[service]?.ports ?? []).map(
    ({ published: port, protocol }) => `${port}/${protocol}`,
  );

describe('docker-compose.staging.yml (task 2.2)', () => {
  it('Caddy publishes 80/tcp, 443/tcp and 443/udp', () => {
    expect(published('caddy').sort()).toStrictEqual(['443/tcp', '443/udp', '80/tcp']);
  });

  it.each(['mailpit', 'postgres', 'api', 'web', 'backup'])('%s publishes no port', (service) => {
    expect(rendered.services[service]).toBeDefined();
    expect(published(service)).toStrictEqual([]);
  });

  it('only Caddy publishes a port at all', () => {
    const publishing = Object.keys(rendered.services).filter((s) => published(s).length > 0);
    expect(publishing).toStrictEqual(['caddy']);
  });

  it('pulls the release images from the registry of IMAGE_PREFIX', () => {
    for (const [service, image] of [
      ['api', 'point-api'],
      ['web', 'point-web'],
      ['backup', 'point-backup'],
      ['migrate', 'point-api'],
    ]) {
      expect(rendered.services[service].image).toBe(`ghcr.io/owner/${image}:0.0.0-dev`);
    }
  });

  it('runs the pinned Mailpit as the server inbox', () => {
    expect(rendered.services.mailpit.image).toBe('axllent/mailpit:v1.31.4');
  });
});
