// Writes src/settings/settings.generated.ts from definitions/settings.json, the only place a setting
// key is defined (D-PLT-16 · D-ROLE-08 pattern · add-settings-store design D2). TypeScript reads a
// JSON import as plain strings, so the key union of SettingKey comes from this typed copy.
// `--check` exits with status 1 when the copy is stale (src/settings/definitions.test.ts runs it).
// `--source=<file>` and `--target=<file>` point it at other files (the stale-copy test only).
//
//   pnpm --filter @point/shared settings:generate
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const option = (name, fallback) => {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg === undefined ? fallback : resolve(arg.slice(name.length + 3));
};
const source = option('source', join(root, 'definitions/settings.json'));
const target = option('target', join(root, 'src/settings/settings.generated.ts'));

const entries = JSON.parse(readFileSync(source, 'utf8'));
const text = [
  '// Generated from definitions/settings.json by scripts/generate-settings.mjs — do not edit.',
  '// Run `pnpm --filter @point/shared settings:generate` after changing the JSON file.',
  `export const SETTING_ENTRIES = ${JSON.stringify(entries)} as const;`,
  '',
].join('\n');
const generated = await format(text, {
  ...(await resolveConfig(join(root, 'src/settings/settings.generated.ts'))),
  filepath: target,
});

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // A missing copy is stale too.
  }
  if (current !== generated) {
    console.error(
      'src/settings/settings.generated.ts is stale: run pnpm --filter @point/shared settings:generate',
    );
    process.exit(1);
  }
} else {
  writeFileSync(target, generated);
}
