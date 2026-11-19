// The web app defines no route handler under /api — /api belongs to the NestJS API at the edge
// (ADR-009 · API-SHAPE-01 · CG-ARCH-06 · design D10). Fails when a route handler file
// (route.ts / .tsx / .js / .jsx) sits anywhere below a folder named `api` in apps/web/app/.
// Checks the repository it lives in; `--root=<dir>` checks another tree (tests).
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROUTE_HANDLER = /^route\.(?:ts|tsx|js|jsx)$/;

/** Repository-relative paths of the route handlers below an `api` folder of apps/web/app/. */
export function findApiRouteHandlers(root) {
  const appDir = join(root, 'apps', 'web', 'app');
  if (!existsSync(appDir)) return [];
  const found = [];
  const walk = (dir, underApi) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, underApi || entry.name === 'api');
      else if (underApi && ROUTE_HANDLER.test(entry.name)) {
        found.push(relative(root, path).split(sep).join('/'));
      }
    }
  };
  walk(appDir, false);
  return found.sort();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const handlers = findApiRouteHandlers(root);
  for (const path of handlers) {
    console.error(
      `check-web-api-routes: ${path} — no route handler under /api in the web app; /api is the NestJS API (CG-ARCH-06 · ADR-009)`,
    );
  }
  if (handlers.length === 0) console.log('check-web-api-routes: ok — no route handler under /api');
  process.exit(handlers.length === 0 ? 0 : 1);
}
