// Module-boundary rules — owner: Dev 2 (design D3).
// Cross-module imports only through index.ts, the Prisma client only in repositories/ and
// src/common/database/, apps/web never imports Prisma or apps/api (design D10 · ADR-001 module
// boundary rules 1–2). All through `no-restricted-imports`: a later config object for the same file
// replaces the rule's options, so every object below carries the full pattern list for its files.
// The package dependency zones (`import-x/no-restricted-paths`, add-ci-lint-rules design D13) are one
// option list built by `packageZones`; `add-ci-lint-api` and the web side extend that list, not add an object.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importX } from 'eslint-plugin-import-x';

const MODULES = 'apps/api/src/modules';
// The deepest folder level inside a module that the generated globs cover.
const MAX_DEPTH = 6;

const PRISMA_MESSAGE =
  "The Prisma client is imported only in a module's repositories/ folder and in src/common/database/ (ADR-001 · design D10).";
const PRISMA = [
  { regex: '^@prisma/', message: PRISMA_MESSAGE },
  { regex: '(^|/)generated/prisma(/|$)', message: PRISMA_MESSAGE },
];

// An SDK is imported only inside the one folder that wraps it (CG-ARCH-08 · guideline §24 row 22):
// the rest of the API uses the wrapper's service.
const SDKS = [
  { name: 'pg-boss', folder: 'platform/jobs' },
  { name: 'nodemailer', folder: 'platform/mail' },
  { name: 'openid-client', folder: 'auth/google' },
  { name: '@sentry/nestjs', folder: 'platform/observability' },
];

/** The SDK patterns for a file; `allowed` = the one SDK its wrapper folder may import. */
const sdkPatterns = (allowed) =>
  SDKS.filter(({ name }) => name !== allowed).map(({ name, folder }) => ({
    regex: `^${name}(/|$)`,
    message: `${name} is imported only in ${MODULES}/${folder}/ — use its service there (CG-ARCH-08 · guideline §24 row 22).`,
  }));

/**
 * From a file `depth` folders below its module's root, `../` × (depth + 1) leaves the module; a path
 * that then names another module and goes further than its index is a reach-in.
 */
function reachIn(depth) {
  const up = String.raw`\.\./`.repeat(depth + 1);
  return {
    regex: String.raw`^${up}[^./][^/]*/(?!index(\.js)?$).+`,
    message:
      "Another module is imported only through its index.ts — import '../<module>' (ADR-001 module boundary rule 1 · design D10).",
  };
}

const FROM_OUTSIDE = {
  regex: String.raw`(^|/)modules/[^/]+/(?!index(\.js)?$).+`,
  message:
    "A module is imported only through its index.ts — import './modules/<module>/index.js' (ADR-001 module boundary rule 1 · design D10).",
};

const restrict = (patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

const depthGlob = (depth) => `${MODULES}/*/${'*/'.repeat(depth)}*.ts`;

const moduleConfigs = Array.from({ length: MAX_DEPTH + 1 }, (_, depth) => [
  { files: [depthGlob(depth)], rules: restrict([reachIn(depth), ...PRISMA, ...sdkPatterns()]) },
  // A module's repositories/ folder may use the Prisma client; the boundary rule still applies.
  {
    files: [[depthGlob(depth), '**/repositories/**']],
    rules: restrict([reachIn(depth), ...sdkPatterns()]),
  },
]).flat();

// Each wrapper folder may import its own SDK; every other rule still applies.
const wrapperConfigs = SDKS.flatMap(({ name, folder }) =>
  Array.from({ length: MAX_DEPTH }, (_, level) => ({
    files: [`${MODULES}/${folder}/${'*/'.repeat(level)}*.ts`],
    rules: restrict([reachIn(level + 1), ...PRISMA, ...sdkPatterns(name)]),
  })),
);

// A substitute for the real database in a test is never imported (CG-TEST-04 · guideline §24 row 68).
const DB_MESSAGE =
  'A substitute database (pg-mem, SQLite, PGlite, a Prisma mock) — tests run against a real PostgreSQL 16 (CG-TEST-04).';
const DB_SUBSTITUTES = [
  {
    regex: String.raw`^(pg-mem|sqlite3?|better-sqlite3|@electric-sql/pglite|prisma-mock|@quramy/jest-prisma[a-z-]*)(/|$)`,
    message: DB_MESSAGE,
  },
];

const WEB_MESSAGE =
  'The web app reaches data only through the HTTP API — never the Prisma client or apps/api (ADR-001 · ADR-009 · design D10).';
const WEB_PATTERNS = [
  { regex: '^@prisma/', message: WEB_MESSAGE },
  { regex: '(^|/)generated/prisma(/|$)', message: WEB_MESSAGE },
  { regex: '^api(/|$)', message: WEB_MESSAGE },
  // Any PostgreSQL client, not only Prisma (CG-ARCH-06 · guideline §24 row 20).
  { regex: '^(pg|pg-[a-z-]+|postgres)(/|$)', message: WEB_MESSAGE },
  { regex: '(^|/)apps/api(/|$)', message: WEB_MESSAGE },
  ...DB_SUBSTITUTES,
];
// The web app's Sentry SDK: only its error-reporting files (CG-ARCH-08 · add-staging-deploy D10).
const WEB_SENTRY_FILES = ['apps/web/lib/observability/**', 'apps/web/instrumentation.ts'];
const WEB_SENTRY = {
  regex: '^@sentry/',
  message:
    'The Sentry SDK is imported only in apps/web/lib/observability/ and apps/web/instrumentation.ts (CG-ARCH-08 · guideline §24 row 22).',
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = '**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}';
// The workspaces the package rules cover so far (add-ci-lint-rules A1).
const A1_WORKSPACES = ['packages/shared', 'packages/documents', 'e2e'].map(
  (path) => `${path}/${SOURCE}`,
);

/**
 * The zones of `import-x/no-restricted-paths` (CG-ARCH-04 · CG-DEP-06 · design D13), written relative to
 * `basePath` — the repository root in the real configuration, the graph fixture tree in its test.
 */
export function packageZones(basePath) {
  const at = (path) => resolve(basePath, path);
  const zone = (target, from, message, except) => ({
    target: at(target),
    from: at(from),
    message: `${message} (CG-ARCH-04 · design D13).`,
    ...(except === undefined ? {} : { except }),
  });
  const SHARED = 'packages/shared imports no other internal package';
  return [
    // The language files are data and `packages/i18n` imports nothing: words.ts reads them.
    zone('packages/shared/src', 'packages/i18n', SHARED, ['./messages']),
    ...['packages/ui', 'packages/documents', 'apps'].map((from) =>
      zone('packages/shared/src', from, SHARED),
    ),
    zone('packages/documents', 'packages/ui', 'packages/documents does not import packages/ui'),
    zone('packages/documents', 'apps', 'packages/documents does not import an app'),
  ];
}

export default [
  {
    // The API outside its modules (app.module.ts, src/common/): modules only through their index.ts,
    // the Prisma client only in src/common/database/.
    files: ['apps/api/src/**/*.ts'],
    ignores: [`${MODULES}/**`, 'apps/api/src/common/database/**', 'apps/api/src/generated/**'],
    rules: restrict([FROM_OUTSIDE, ...PRISMA, ...sdkPatterns()]),
  },
  {
    files: ['apps/api/src/common/database/**/*.ts'],
    rules: restrict([FROM_OUTSIDE, ...sdkPatterns()]),
  },
  ...moduleConfigs,
  ...wrapperConfigs,
  {
    files: [
      'apps/web/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
      'packages/ui/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    ],
    rules: restrict([...WEB_PATTERNS, WEB_SENTRY]),
  },
  {
    files: WEB_SENTRY_FILES,
    rules: restrict(WEB_PATTERNS),
  },
  {
    // No database substitute anywhere else in the covered workspaces (web and ui: WEB_PATTERNS).
    files: A1_WORKSPACES,
    rules: restrict(DB_SUBSTITUTES),
  },
  {
    files: A1_WORKSPACES,
    plugins: { 'import-x': importX },
    rules: { 'import-x/no-restricted-paths': ['error', { zones: packageZones(ROOT) }] },
  },
];
