// Every self-hosted font family has its licence file next to it (AD-VIS-05 · design D3). A family
// is a WOFF2 file name in packages/ui/fonts without its subset or style suffix (`archivo-black-latin`
// → ArchivoBlack, `pyidaungsu-bold` → Pyidaungsu); its licence is `OFL-<Family>.txt` or
// `LICENSE-<Family>.txt`, copied from the font's own distribution. Alias: `pnpm fonts:check`.
// Checks the repository it lives in; `--root=<dir>` checks another tree.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FONTS = 'packages/ui/fonts';
const SUFFIX = /(?:-(?:latin|myanmar|regular|bold|italic|\d+))+$/;

/** `archivo-black-latin.woff2` → `ArchivoBlack`. */
export function familyOf(fileName) {
  return fileName
    .replace(/\.woff2$/, '')
    .replace(SUFFIX, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** Families that have a WOFF2 file and no licence file: { family, files }. */
export function findMissingLicences(root) {
  const dir = join(root, FONTS);
  if (!existsSync(dir)) return { families: 0, missing: [] };
  const names = readdirSync(dir);
  const byFamily = new Map();
  for (const name of names.filter((n) => n.endsWith('.woff2')).sort()) {
    const family = familyOf(name);
    byFamily.set(family, [...(byFamily.get(family) ?? []), name]);
  }
  const missing = [...byFamily]
    .filter(([family]) => !names.includes(`OFL-${family}.txt`))
    .filter(([family]) => !names.includes(`LICENSE-${family}.txt`))
    .map(([family, files]) => ({ family, files }));
  return { families: byFamily.size, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = process.argv.find((a) => a.startsWith('--root='));
  const root = arg
    ? resolve(arg.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const { families, missing } = findMissingLicences(root);
  for (const { family, files } of missing) {
    console.error(
      `check-fonts: ${family} has no OFL-${family}.txt or LICENSE-${family}.txt in ${FONTS} ` +
        `(${files.join(', ')}); copy the licence from the font's distribution (AD-VIS-05)`,
    );
  }
  if (missing.length === 0) console.log(`check-fonts: ok — ${families} families, each licensed`);
  process.exit(missing.length === 0 ? 0 : 1);
}
