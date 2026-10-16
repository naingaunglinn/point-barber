# syntax=docker/dockerfile:1
# API image (design D13 / D14 · ADR-001 · CG-DEP-03). Build from the repository root:
#   docker build -f apps/api/Dockerfile --build-arg APP_VERSION=<tag or commit> .
# Debian-based Node so that the final stage can carry Chromium and its libraries (D14 · ADR-013). The final stage holds the production dependencies, the build output and what the
# `migrate` service runs (db/migrations, db/schema.prisma, db/scripts/migrate.mjs, prisma.config.ts
# and the Prisma CLI) — no source, no test file, no environment file.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
# OpenSSL here too: @prisma/engines downloads the schema engine for the OpenSSL it detects at install
# time. The runtime stage has OpenSSL, so the build must pick the same engine — otherwise migrate
# tries to download another one into the read-only node_modules and fails.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
# Dependencies first, so a source change does not refetch them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# The pnpm patches of patchedDependencies (pnpm-workspace.yaml) — fetch and install read them.
COPY patches ./patches
# pnpm fetch always reads pnpm-lock.yaml as is (no --frozen-lockfile flag in pnpm 12).
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# shared → Prisma client → api (turbo.json: build depends on ^build and generate).
RUN pnpm turbo run build --filter=api --output-logs=errors-only
# The api package with its production dependencies only (the `files` fields keep test/ out).
RUN pnpm --filter=api deploy --prod --legacy /out
# The pinned playwright-core on its own (it has no dependencies), so the runtime stage installs its
# browser in a layer that only changes with the playwright-core version.
RUN cp -rL /out/node_modules/playwright-core /playwright-core

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0-dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
# OpenSSL for Prisma's schema engine (the migrate service): without it every run printed
# "prisma:warn Prisma failed to detect the libssl/openssl version" (PR-I 9.4).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
# Headless Chromium of the DocumentRenderer (ADR-013 · add-walkin-visit-checkout task 9.15): the
# headless shell of the pinned playwright-core with its system libraries, in a root-owned folder the
# `node` user reads; the server launches it as `node`, never as root. No system font is installed:
# the documents inline their fonts (Pyidaungsu, Inter) from @point/documents, deployed with the api.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /playwright-core /tmp/playwright-core
RUN node /tmp/playwright-core/cli.js install --with-deps --only-shell chromium \
 && rm -rf /tmp/playwright-core /var/lib/apt/lists/*
# Root-owned and read-only for the `node` user that runs the server. /out holds package.json,
# node_modules and dist (the `files` field).
COPY --from=build /out ./
COPY db/migrations ./db/migrations
COPY db/schema.prisma ./db/schema.prisma
COPY db/scripts/migrate.mjs ./db/scripts/migrate.mjs
COPY prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
