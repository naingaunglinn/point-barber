// No toISOString() cut into a date or a time (CG-TIME-02 · §24 row 41): the string is UTC, and a
// sale at 00:40 in Myanmar belongs to the next calendar day. Use businessDateOf from @point/shared.
// Comments are not read. Checks the repository it lives in; `--root=<dir>` checks another tree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { lineOf, report, rootFromArgs, stripComments, walk } from './lib/source.mjs';

const SCOPES = ['apps', 'packages', 'e2e', 'tools'];
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];
const PATTERN = /toISOString\s*\(\s*\)\s*\.\s*(slice|split|substring|substr)\s*\(/g;

/** Hits for every cut of a toISOString() result. */
export function findDateSlices(root) {
  const hits = [];
  for (const path of walk(root, { scopes: SCOPES, extensions: EXTENSIONS })) {
    const text = stripComments(readFileSync(join(root, path), 'utf8'));
    for (const match of text.matchAll(PATTERN)) {
      hits.push({
        path,
        line: lineOf(text, match.index),
        message: `toISOString().${match[1]}( cuts a UTC date, not the Myanmar business date; use businessDateOf from packages/shared/src/time`,
        cg: 'CG-TIME-02',
      });
    }
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hits = findDateSlices(rootFromArgs(import.meta.url));
  process.exit(report('check-date-slice', hits, 'no toISOString() cut into a date'));
}
