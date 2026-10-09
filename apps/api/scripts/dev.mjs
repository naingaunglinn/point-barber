// `pnpm dev` for the API (design D12, host-run development): builds once, then recompiles on change
// (tsc --watch) and restarts the server on each new build (node --watch). Listens on port 3101 —
// docker-compose.dev.yml points Caddy's API_UPSTREAM at host.docker.internal:3101; inside Compose
// the API stays on 3001. The other variables come from the repository's .env (cp .env.example .env).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const api = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = createRequire(join(api, 'package.json')).resolve('typescript/bin/tsc');
const DEV_PORT = '3101';

// The root .env is read here, once, and handed over as the environment — not with node's
// --env-file-if-exists: node --watch also watches that file, and for a missing one it watched the
// whole repository, so every write to apps/web/.next, node_modules or .git restarted the API (58
// restarts in 8 minutes on Windows — PR-I 9.4). A variable already set in the shell wins over .env.
const envFile = join(api, '..', '..', '.env');
const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const serverEnv = { ...fromFile, ...process.env, API_PORT: DEV_PORT };

const first = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.build.json'], {
  cwd: api,
  stdio: 'inherit',
});
if (first.status !== 0) process.exit(first.status ?? 1);

const children = [
  spawn(process.execPath, [tsc, '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'], {
    cwd: api,
    stdio: 'inherit',
  }),
  // Restarts only when tsc writes a new build into dist/.
  spawn(process.execPath, ['--watch-path=dist', 'dist/main.js'], {
    cwd: api,
    stdio: 'inherit',
    env: serverEnv,
  }),
];

const stop = () => {
  for (const child of children) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) {
  child.on('exit', (code) => {
    stop();
    process.exitCode = code ?? 0;
  });
}
