import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The .env.example header says host-run tools read .env. The db:* scripts that need a connection
// load the root .env themselves; a variable already set in the shell still wins, so CI — which sets
// them in the shell and has no .env — is unchanged (PR-I 9.4).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

describe('root package.json db scripts', () => {
  it.each(['db:migrate', 'db:test', 'db:check-introspection'])('%s loads the root .env', (name) => {
    expect(scripts[name]).toMatch(/^node --env-file-if-exists=\.env db\/scripts\/\S+\.mjs$/);
  });

  it.each(['db:build-baseline', 'db:check-source'])(
    '%s needs no connection and no .env',
    (name) => {
      expect(scripts[name]).not.toContain('--env-file');
    },
  );
});
