# syntax=docker/dockerfile:1
# Web image (design D3 / D11 · ADR-001 · ADR-006). Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg APP_VERSION=<tag or commit> .
# Runs the Next.js standalone output; the build cache volume is mounted on .next/cache (D13).
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1 NEXT_TELEMETRY_DISABLED=1
# The install covers the whole workspace, so @prisma/engines' postinstall runs here too, though the
# web app never uses Prisma; with OpenSSL present it stops printing a warning a reader can't place.
# Build stage only — the runtime image is unchanged.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# The pnpm patches of patchedDependencies (pnpm-workspace.yaml) — fetch and install read them.
COPY patches ./patches
# pnpm fetch always reads pnpm-lock.yaml as is (no --frozen-lockfile flag in pnpm 12).
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm turbo run build --filter=web --output-logs=errors-only

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0-dev
# HOSTNAME=0.0.0.0: the standalone server binds every interface. Bound to 127.0.0.1, the rewrite in
# proxy.ts leaves the container as an outside URL instead of reaching its own server (seen in PR-D).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    APP_VERSION=${APP_VERSION} \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# The self-hosted fonts, served at /fonts/ (copied from packages/ui/fonts by the build script).
COPY --from=build /repo/apps/web/public ./apps/web/public
# The next_cache volume is mounted here; created owned by `node` so the volume starts writable.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
