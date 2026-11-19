// Root Vitest config: one project per workspace (design D2) plus the root tooling tests
// (guards, lint rules, git hooks). A workspace becomes a project as soon as it exists.
import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const workspaces = ['apps', 'packages', 'tools']
  .filter((root) => existsSync(root))
  .flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(`${root}/${entry.name}/package.json`))
      .map((entry) => `${root}/${entry.name}`),
  );
if (existsSync('e2e/package.json')) workspaces.push('e2e');

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'tooling',
          include: ['tools/**/*.test.mjs', 'db/scripts/**/*.test.mjs', 'db/seed/**/*.test.mjs'],
          // A folder under tools/ with its own package.json is its own project below.
          exclude: [
            '**/node_modules/**',
            ...workspaces.filter((w) => w.startsWith('tools/')).map((w) => `${w}/**`),
          ],
          environment: 'node',
        },
      },
      ...workspaces,
    ],
  },
});
