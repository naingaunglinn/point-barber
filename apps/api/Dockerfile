# syntax=docker/dockerfile:1
# API image (design D13 / D14 · ADR-001 · CG-DEP-03). Build from the repository root:
#   docker build -f apps/api/Dockerfile --build-arg APP_VERSION=<tag or commit> .
# Debian-based Node so that add-walkin-visit-checkout can add Chromium and fonts to the final stage
# with apt (D14). The final stage holds the production dependencies, the build output and what the
# `migrate` service runs (db/migrations, db/schema.prisma, db/scripts/migrate.mjs, prisma.config.ts
# and the Prisma CLI) — no source, no test file, no environment file.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
RUN corepack enable
WORKDIR /repo
# Dependencies first, so a source change does not refetch them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# pnpm fetch always reads pnpm-lock.yaml as is (no --frozen-lockfile flag in pnpm 12).
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
# shared → Prisma client → api (turbo.json: build depends on ^build and generate).
RUN pnpm turbo run build --filter=api --output-logs=errors-only
# The api package with its production dependencies only (the `files` fields keep test/ out).
RUN pnpm --filter=api deploy --prod --legacy /out

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0-dev
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
# Root-owned and read-only for the `node` user that runs the server.
COPY --from=build /out ./
COPY --from=build /repo/apps/api/dist ./dist
COPY db/migrations ./db/migrations
COPY db/schema.prisma ./db/schema.prisma
COPY db/scripts/migrate.mjs ./db/scripts/migrate.mjs
COPY prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
