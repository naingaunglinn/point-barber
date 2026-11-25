// No BigInt.prototype.toJSON (CG-MONEY-02 · §24 row 38): a global patch turns every amount into a
// string or a lossy number; money goes to the wire through moneyToWire. Comments are not read.
// Checks the repository it lives in; `--root=<dir>` checks another tree.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { lineOf, report, rootFromArgs, stripComments, walk } from './lib/source.mjs';

const SCOPES = ['apps', 'packages', 'e2e', 'tools', 'db'];
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];
const PROTOTYPE = String.raw`BigInt\s*\.\s*prototype`;
// `(BigInt.prototype as any)`: TypeScript refuses the bare assignment, so a patch goes through a cast.
const CAST = String.raw`(?:\s+as\s[^;\n]*?)?`;
// The assignment or member form, the bracket forms, and Object.defineProperty(BigInt.prototype, …).
const PATTERN = new RegExp(
  String.raw`${PROTOTYPE}${CAST}\s*\)?\s*(?:\.\s*toJSON\b|\[\s*(['"])toJSON\1\s*\])|defineProperty\s*\(\s*${PROTOTYPE}${CAST}\s*,\s*(['"])toJSON\2`,
  'g',
);
const SUBJECT = 'BigInt.prototype';

/** Hits for every patch of BigInt.prototype.toJSON in code. */
export function findBigIntToJson(root) {
  const hits = [];
  for (const path of walk(root, { scopes: SCOPES, extensions: EXTENSIONS })) {
    const text = stripComments(readFileSync(join(root, path), 'utf8'));
    for (const match of text.matchAll(PATTERN)) {
      hits.push({
        path,
        line: lineOf(text, match.index),
        message: `${SUBJECT}.toJSON turns amounts into strings or lossy numbers; convert with moneyToWire from packages/shared/src/money`,
        cg: 'CG-MONEY-02',
      });
    }
  }
  return hits;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const hits = findBigIntToJson(rootFromArgs(import.meta.url));
  process.exit(report('check-bigint-tojson', hits, 'no BigInt toJSON patch'));
}
