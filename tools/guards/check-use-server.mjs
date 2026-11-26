// No 'use server' in apps/web (CG-ARCH-06 · §24 row 20): the web app calls the API; it has no Server
// Actions. A directive is a line that, outside comments, is only the string with an optional `;`.
// Checks the repository it lives in; `--root=<dir>` checks another tree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { report, rootFromArgs, stripComments, walk } from './lib/source.mjs';

const DIRECTIVE = /^(['"])use server\1;?$/;

/** Hits for every directive line in the web app. */
export function findUseServer(root) {
  const hits = [];
  for (const path of walk(root, {
    scopes: ['apps/web'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  })) {
    const lines = stripComments(readFileSync(join(root, path), 'utf8')).split('\n');
    lines.forEach((text, index) => {
      if (!DIRECTIVE.test(text.trim())) return;
      hits.push({
        path,
        line: index + 1,
        message: "'use server' is not allowed in the web app; call the API instead",
        cg: 'CG-ARCH-06',
      });
    });
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(
    report(
      'check-use-server',
      findUseServer(rootFromArgs(import.meta.url)),
      "no 'use server' in apps/web",
    ),
  );
}
