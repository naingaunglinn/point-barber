// The catalogue `/dev/ui` stays out of the production image (AD-IMPL-06 · AD-PERM-01 ·
// add-shared-ui-components design D12): its flag NEXT_PUBLIC_DEV_CATALOGUE is set only in the `dev` and
// `build:catalogue` scripts of apps/web. Fails when the flag name appears in an `.env*` file, a
// Dockerfile, a Compose file, a CI workflow, a `next.config.*`, or any other package.json script; and
// when the root `.dockerignore` does not keep `.env*` files out of the image build context.
// `--root=<dir>` checks another tree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FLAG = 'NEXT_PUBLIC_DEV_CATALOGUE';
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'coverage']);
const ALLOWED_SCRIPTS = new Set(['dev', 'build:catalogue']);

/** Files where the flag may never appear. */
function forbidden(path) {
  const name = path.split('/').at(-1) ?? '';
  return (
    name.startsWith('.env') ||
    name.startsWith('Dockerfile') ||
    /^(?:docker-)?compose[\w.-]*\.ya?ml$/.test(name) ||
    /^next\.config\.[cm]?[jt]s$/.test(name) ||
    path.startsWith('.github/workflows/')
  );
}

function files(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path);
      } else if (entry.isFile()) {
        out.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** True when the ignore file keeps every `.env*` file out (`.env*`, `**\/.env*`, or `.env` + `.env.*`). */
function ignoresEnvFiles(text) {
  const lines = new Set(
    text
      .split('\n')
      .map((line) => line.trim().replace(/^\*\*\//, ''))
      .filter((line) => line !== '' && !line.startsWith('#')),
  );
  return lines.has('.env*') || (lines.has('.env') && lines.has('.env.*'));
}

/** Every problem: { path, reason }. */
export function findCatalogueFlag(root) {
  const problems = [];
  for (const path of files(root)) {
    const name = path.split('/').at(-1);
    if (forbidden(path)) {
      if (readFileSync(join(root, path), 'utf8').includes(FLAG)) {
        problems.push({ path, reason: `${FLAG} must not appear here` });
      }
    } else if (name === 'package.json') {
      const { scripts = {} } = JSON.parse(readFileSync(join(root, path), 'utf8'));
      for (const [script, command] of Object.entries(scripts)) {
        const allowed = path === 'apps/web/package.json' && ALLOWED_SCRIPTS.has(script);
        if (!allowed && String(command).includes(FLAG)) {
          problems.push({
            path,
            reason: `script "${script}" sets ${FLAG} — only dev and build:catalogue of apps/web may`,
          });
        }
      }
    }
  }
  const ignore = join(root, '.dockerignore');
  if (!existsSync(ignore) || !ignoresEnvFiles(readFileSync(ignore, 'utf8'))) {
    problems.push({
      path: '.dockerignore',
      reason: '.env* files must be excluded from the image build context',
    });
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const problems = findCatalogueFlag(root);
  for (const { path, reason } of problems) {
    console.error(`check-catalogue-flag: ${path} — ${reason} (AD-IMPL-06 · design D12)`);
  }
  if (problems.length === 0) {
    console.log(
      `check-catalogue-flag: ok — ${FLAG} only in the dev and build:catalogue scripts of apps/web`,
    );
  }
  process.exit(problems.length === 0 ? 0 : 1);
}
