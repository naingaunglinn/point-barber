import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

// Prettier reads the root .gitignore and .prettierignore only, so a file that a workspace's own
// .gitignore hides (apps/web/.gitignore → next-env.d.ts) must be named in the root .prettierignore,
// or `pnpm format:check` fails locally after `next dev` / `next build` (PR #5 review).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('root .prettierignore', () => {
  it('ignores apps/web/next-env.d.ts, which Next.js generates', async () => {
    const info = await prettier.getFileInfo(join(root, 'apps/web/next-env.d.ts'), {
      ignorePath: join(root, '.prettierignore'),
    });
    expect(info.ignored).toBe(true);
  });

  it('still checks the web app source next to it', async () => {
    const info = await prettier.getFileInfo(join(root, 'apps/web/next.config.ts'), {
      ignorePath: join(root, '.prettierignore'),
    });
    expect(info.ignored).toBe(false);
  });
});
