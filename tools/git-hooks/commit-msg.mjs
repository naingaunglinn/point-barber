// commit-msg hook: checks the first line of the message file (CG-GIT-02 · design D15).
import { readFileSync } from 'node:fs';

import { checkCommitHeader } from '../guards/lib/conventional.mjs';

const file = process.argv[2];
if (!file) {
  console.error('commit-msg: no message file given');
  process.exit(1);
}
const header = readFileSync(file, 'utf8').split(/\r?\n/)[0] ?? '';
const errors = checkCommitHeader(header);
if (errors.length > 0) {
  for (const e of errors) console.error(`commit-msg: ${e}`);
  console.error('commit-msg: expected e.g. "feat(add-repo-scaffold): health endpoint"');
  process.exit(1);
}
