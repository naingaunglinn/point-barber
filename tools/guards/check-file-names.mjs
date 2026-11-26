// No file named utils, helpers, common or misc (CG-NAME-03 · §24 row 13): a name must say what the
// file holds, with its role suffix. The whole name is matched, so `format-helpers.ts` and a folder
// called `helpers/` pass. Checks the repository it lives in; `--root=<dir>` checks another tree.
import { pathToFileURL } from 'node:url';

import { report, rootFromArgs, walk } from './lib/source.mjs';

const SCOPES = ['apps', 'packages', 'e2e', 'tools', 'db'];
const BANNED = new Set(
  ['utils', 'helpers', 'common', 'misc'].flatMap((name) => [`${name}.ts`, `${name}.tsx`]),
);

/** Hits for the files in scope whose whole name is a banned one. */
export function findBannedNames(root) {
  return walk(root, { scopes: SCOPES, extensions: ['.ts', '.tsx'] })
    .filter((path) => BANNED.has(path.slice(path.lastIndexOf('/') + 1)))
    .map((path) => ({
      path,
      message: `"${path.slice(path.lastIndexOf('/') + 1)}" names no role; name the file after what it holds, with its role suffix`,
      cg: 'CG-NAME-03',
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hits = findBannedNames(rootFromArgs(import.meta.url));
  process.exit(report('check-file-names', hits, 'no file named utils, helpers, common or misc'));
}
