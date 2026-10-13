// Module-boundary rules — owner: Dev 2 (design D3).
// Cross-module imports only through index.ts, the Prisma client only in repositories/ and
// src/common/database/, apps/web never imports Prisma or apps/api (design D10 · ADR-001 module
// boundary rules 1–2). All through `no-restricted-imports`: a later config object for the same file
// replaces the rule's options, so every object below carries the full pattern list for its files.

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

const WEB_MESSAGE =
  'The web app reaches data only through the HTTP API — never the Prisma client or apps/api (ADR-001 · ADR-009 · design D10).';

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
    rules: restrict([
      { regex: '^@prisma/', message: WEB_MESSAGE },
      { regex: '(^|/)generated/prisma(/|$)', message: WEB_MESSAGE },
      { regex: '^api(/|$)', message: WEB_MESSAGE },
      // Any PostgreSQL client, not only Prisma (CG-ARCH-06 · guideline §24 row 20).
      { regex: '^(pg|pg-[a-z-]+|postgres)(/|$)', message: WEB_MESSAGE },
      { regex: '(^|/)apps/api(/|$)', message: WEB_MESSAGE },
    ]),
  },
];
