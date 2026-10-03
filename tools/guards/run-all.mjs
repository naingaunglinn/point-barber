// `pnpm guards` — runs every tools/guards/check-*.mjs that takes no argument (design D10).
// A guard that needs input (a PR title, a branch name) carries the line `// guard:needs-input`
// and is run by its own CI step instead. Add a guard by adding a file; do not edit this script.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const guards = readdirSync(dir)
  .filter((name) => /^check-.+\.mjs$/.test(name))
  .filter((name) => !readFileSync(join(dir, name), 'utf8').includes('// guard:needs-input'))
  .sort();

let failed = 0;
for (const name of guards) {
  const result = spawnSync(process.execPath, [join(dir, name)], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`guard failed: ${name}`);
  }
}
console.log(`${guards.length} guard(s) run, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
