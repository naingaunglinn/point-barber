// Runs the given unit suites three times, under TZ=UTC, TZ=Asia/Yangon and TZ=America/Los_Angeles
// (CG-TIME-04 · add-shared-ui-components design D13): the expected values are the same in each run,
// because nothing depends on the machine's — or the phone's — time zone.
//   node tools/test-zones.mjs <suite path> …   (paths from the repository root; see `test:zones`)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = createRequire(resolve(root, 'package.json')).resolve('vitest/package.json');
const vitest = resolve(dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.vitest);
const suites = process.argv.slice(2);
if (suites.length === 0) {
  console.error('usage: test-zones.mjs <suite path> …');
  process.exit(2);
}

let failed = 0;
for (const zone of ['UTC', 'Asia/Yangon', 'America/Los_Angeles']) {
  console.log(`test-zones: TZ=${zone}`);
  const result = spawnSync(process.execPath, [vitest, 'run', ...suites], {
    cwd: root,
    env: { ...process.env, TZ: zone },
    stdio: 'inherit',
  });
  if (result.status !== 0) failed += 1;
}
process.exit(failed === 0 ? 0 : 1);
