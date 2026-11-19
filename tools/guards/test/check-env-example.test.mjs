import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const guard = resolve(dirname(fileURLToPath(import.meta.url)), '../check-env-example.mjs');
const roots = [];

const API_SCHEMA = `export const apiEnvSchema = z.object({
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number(),
});
`;
const WEB_ENV = `const webEnvSchema = z.object({
  SITE_ORIGIN: origin,
});
`;
const COMPOSE = `services:
  api:
    environment:
      DATABASE_URL: \${DATABASE_URL}
      API_PORT: \${API_PORT:-3001}
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d $\${POSTGRES_DB}']
`;
const CADDYFILE = `{$SITE_ORIGIN} {
	reverse_proxy {$API_UPSTREAM:api:3001}
}
`;
const ENV_EXAMPLE = `# Public host.
SITE_ORIGIN=https://point.test
# API connection.
DATABASE_URL=postgresql://x
# API port.
API_PORT=3001
# API upstream.
API_UPSTREAM=api:3001

# reserved: add-attachments-upload reads the bucket keys
# Bucket endpoint.
S3_ENDPOINT=
`;

/** A temporary repository tree; `overrides` replaces or adds files ({ path: contents }). */
function tree(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-env-example-'));
  roots.push(root);
  const files = {
    '.env.example': ENV_EXAMPLE,
    'docker-compose.yml': COMPOSE,
    'infra/caddy/Caddyfile': CADDYFILE,
    'apps/api/src/common/config/env.schema.ts': API_SCHEMA,
    'apps/web/env.ts': WEB_ENV,
    ...overrides,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function run(root) {
  const result = spawnSync(process.execPath, [guard, `--root=${root}`], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// Technical guarantee, no spec scenario: CG-SEC-05 · design D13 · D19.
describe('tools/guards/check-env-example.mjs (CG-SEC-05 · design D13)', () => {
  it('passes when the four lists agree', () => {
    const { status, output } = run(tree());
    expect(output).toContain('ok');
    expect(status).toBe(0);
  });

  it('fails on a ${VAR} of a compose file that .env.example lacks', () => {
    const compose = `${COMPOSE}      LOG_LEVEL: \${LOG_LEVEL}\n`;
    const { status, output } = run(tree({ 'docker-compose.dev.yml': compose }));
    expect(status).toBe(1);
    expect(output).toMatch(/LOG_LEVEL.*docker-compose\.dev\.yml.*missing from \.env\.example/);
  });

  it('fails on a {$VAR} of a Caddyfile that .env.example lacks', () => {
    const caddy = `${CADDYFILE}{$APP_ORIGIN} {\n}\n`;
    const { status, output } = run(tree({ 'infra/caddy/dev/alias.caddy': caddy }));
    expect(status).toBe(1);
    expect(output).toMatch(/APP_ORIGIN.*alias\.caddy.*missing from \.env\.example/);
  });

  it('fails on a key of the API environment schema that .env.example lacks', () => {
    const schema = API_SCHEMA.replace('});', '  LOG_LEVEL: z.enum([]),\n});');
    const { status, output } = run(tree({ 'apps/api/src/common/config/env.schema.ts': schema }));
    expect(status).toBe(1);
    expect(output).toMatch(/LOG_LEVEL.*env\.schema\.ts.*missing from \.env\.example/);
  });

  it('fails on a key of the web environment schema that .env.example lacks', () => {
    const env = WEB_ENV.replace('});', '  API_INTERNAL_BASE: httpUrl,\n});');
    const { status, output } = run(tree({ 'apps/web/env.ts': env }));
    expect(status).toBe(1);
    expect(output).toMatch(/API_INTERNAL_BASE.*apps\/web\/env\.ts.*missing from \.env\.example/);
  });

  it('fails on a key of .env.example that nothing uses and that is not reserved', () => {
    const example = ENV_EXAMPLE.replace(
      '\n# reserved:',
      '# Left over.\nOLD_SETTING=1\n\n# reserved:',
    );
    const { status, output } = run(tree({ '.env.example': example }));
    expect(status).toBe(1);
    expect(output).toMatch(/OLD_SETTING.*used by no compose file, Caddyfile or environment schema/);
  });

  it('passes an unused key under a # reserved: line that names its change', () => {
    expect(run(tree()).status).toBe(0); // S3_ENDPOINT is reserved in the default tree
  });

  it('fails a # reserved: line that names no change', () => {
    const example = ENV_EXAMPLE.replace('add-attachments-upload reads', 'later');
    const { status, output } = run(tree({ '.env.example': example }));
    expect(status).toBe(1);
    expect(output).toMatch(/reserved.*must name the change/);
  });

  it('fails an entry without a one-line comment above it', () => {
    const example = ENV_EXAMPLE.replace('# API port.\n', '');
    const { status, output } = run(tree({ '.env.example': example }));
    expect(status).toBe(1);
    expect(output).toMatch(/API_PORT.*no comment line/);
  });

  // Compose interpolates $VAR without braces too (PR #6 review, item 3).
  it('fails on an unbraced $VAR of a compose file that .env.example lacks', () => {
    const compose = `${COMPOSE}      B: $BAR\n`;
    const { status, output } = run(tree({ 'docker-compose.dev.yml': compose }));
    expect(status).toBe(1);
    expect(output).toMatch(/BAR: used by docker-compose\.dev\.yml but missing from \.env\.example/);
  });

  it('does not read $$VAR (escaped for the container shell) as a compose variable', () => {
    // POSTGRES_USER appears only as "$$POSTGRES_USER" in the default compose file.
    expect(run(tree()).output).not.toContain('POSTGRES_USER');
  });

  it('the real files pass', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
    const { status, output } = run(root);
    expect(output).toContain('ok');
    expect(status).toBe(0);
  });
});
