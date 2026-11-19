// Writes src/permissions/permissions.generated.ts from definitions/permissions.json, the only place
// a permission code is defined (D-ROLE-08). TypeScript reads a JSON import as plain strings, so the
// code union of PermissionCode comes from this typed copy. `--check` exits with status 1 when the
// copy is stale (catalogue.test.ts runs it).
//
//   pnpm --filter @point/shared permissions:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'definitions/permissions.json');
const target = join(root, 'src/permissions/permissions.generated.ts');

const entries = JSON.parse(readFileSync(source, 'utf8'));
const text = [
  '// Generated from definitions/permissions.json by scripts/generate-permissions.mjs — do not edit.',
  '// Run `pnpm --filter @point/shared permissions:generate` after changing the JSON file.',
  `export const PERMISSION_ENTRIES = ${JSON.stringify(entries)} as const;`,
  '',
].join('\n');
const generated = await format(text, { ...(await resolveConfig(target)), filepath: target });

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // A missing copy is stale too.
  }
  if (current !== generated) {
    console.error(
      'src/permissions/permissions.generated.ts is stale: run pnpm --filter @point/shared permissions:generate',
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, generated);
}
