// `pnpm dev` for the API (design D12, host-run development): builds once, then recompiles on change
// (tsc --watch) and restarts the server on each new build (node --watch). Listens on port 3101 —
// docker-compose.dev.yml points Caddy's API_UPSTREAM at host.docker.internal:3101; inside Compose
// the API stays on 3001. The other variables come from the repository's .env (cp .env.example .env).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = join(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = createRequire(join(api, 'package.json')).resolve('typescript/bin/tsc');
const DEV_PORT = '3101';

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
  // A variable already set (API_PORT here) wins over the same name in .env.
  spawn(
    process.execPath,
    ['--watch-path=dist', '--env-file-if-exists=../../.env', 'dist/main.js'],
    {
      cwd: api,
      stdio: 'inherit',
      env: { ...process.env, API_PORT: DEV_PORT },
    },
  ),
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
