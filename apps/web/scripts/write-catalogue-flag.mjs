// Writes the catalogue flag into a source constant before Next.js builds or serves (AD-IMPL-06 ·
// add-shared-ui-components design D12 · PR #13 item 1): `catalogue-flag.generated.ts` holds
// `DEV_CATALOGUE = true` only when NEXT_PUBLIC_DEV_CATALOGUE is `1` in this script's environment,
// which only the `dev` and `build:catalogue` scripts set. The page imports the constant and never
// reads the environment at run time, so a production build compiles `false` and no variable given
// to the running server can open /dev/ui. The file is git-ignored and kept out of the image context.
//   node scripts/write-catalogue-flag.mjs [--out=<file>]
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = process.argv.find((value) => value.startsWith('--out='));
const out = arg
  ? resolve(arg.slice('--out='.length))
  : resolve(dirname(fileURLToPath(import.meta.url)), '../catalogue-flag.generated.ts');
const on = process.env.NEXT_PUBLIC_DEV_CATALOGUE === '1';

writeFileSync(
  out,
  `// Written by scripts/write-catalogue-flag.mjs — do not edit, not committed.\nexport const DEV_CATALOGUE: boolean = ${on};\n`,
);
