// Copies the self-hosted fonts of packages/ui/fonts into public/fonts, so the web app serves them at
// /fonts/ on its own origin — the URLs of the @font-face rules in packages/ui/tokens.css and of the
// preloads (add-shared-ui-components design D3 · FE-PERF-06). public/fonts is generated and
// git-ignored; packages/ui/fonts is the only committed copy. Run by the `dev` and `build` scripts.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(web, '../../packages/ui/fonts');
const target = join(web, 'public/fonts');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const files = readdirSync(source).filter((name) => name.endsWith('.woff2'));
for (const name of files) copyFileSync(join(source, name), join(target, name));
console.log(`copy-fonts: ${files.length} WOFF2 files → apps/web/public/fonts`);
