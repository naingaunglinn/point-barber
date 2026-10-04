// `pnpm --filter api openapi` — writes dist/openapi.json from the built document module (design D5).
// The package script builds first (shared package, Prisma client, API) through Turborepo.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOpenApiDocument } from '../dist/openapi/document.js';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
// A build script outside src may read process.env (design D19).
const version = process.env.APP_VERSION || '0.0.0-dev';

mkdirSync(dist, { recursive: true });
const out = join(dist, 'openapi.json');
writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(version), null, 2)}\n`);
console.log(`openapi: wrote ${out}`);
