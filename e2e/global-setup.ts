import { execSync } from 'node:child_process';

import { repoRoot } from './helpers/stack.js';

// Before the suite (task 8.1 · design D16): `pnpm db:seed` writes the base seed and the fixture people
// — and resets their login state (status, language, failed count, lock, Google id), so every run of
// the sign-in specs starts from spec-fixtures §2.
export default function globalSetup(): void {
  execSync('pnpm db:seed', { cwd: repoRoot, stdio: 'inherit' });
}
