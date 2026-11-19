#!/usr/bin/env bash
# The checks of the built images (scaffold design D15 · add-staging-deploy design D4), run by CI job
# `images` on the commit's images and by the release workflow on the tag's images before the push:
#   tools/ci/check-images.sh <APP_VERSION>
# Expects point-api:<v>, point-web:<v> and point-backup:<v> in the local Docker image store. Run from
# the repository root (the receipt smoke mounts apps/api/scripts/render-smoke.mjs).
set -euo pipefail

v="${1:?usage: check-images.sh <APP_VERSION>}"
fail() { echo "::error::$1"; exit 1; }

echo "== Every image reports $v, never 0.0.0-dev (scaffold D9)"
for image in api web backup; do
  got=$(docker run --rm --entrypoint printenv "point-$image:$v" APP_VERSION)
  echo "point-$image reports $got"
  if [ "$got" = "0.0.0-dev" ] || [ "$got" != "$v" ]; then
    fail "point-$image reports APP_VERSION=$got, expected $v"
  fi
done

# And no development fixture (D-PLT-11 · add-foundation-auth-access design D16).
echo "== The api image holds no test file, no fixture and no environment file (scaffold D13)"
found=$(docker run --rm --entrypoint sh "point-api:$v" -c \
  'find / -xdev \( -path "/app/test*" -o -path "/app/db/seed*" -o -name ".env" -o -name ".env.*" -o -name "*.int.test.*" \) -print 2>/dev/null' || true)
if [ -n "$found" ]; then echo "$found"; fail "unexpected files in the api image"; fi

echo "== The api image carries the first-admin command (P1-RULE-14 · add-foundation-auth-access D10)"
docker run --rm --entrypoint test "point-api:$v" -f /app/dist/cli/admin-create.js \
  || fail "the api image has no dist/cli/admin-create.js"

# add-walkin-visit-checkout task 9.16 (ADR-013): the image's headless Chromium renders as the non-root
# user the server runs as, with the compose memory limit of the api service.
echo "== The api image renders a receipt line (Chromium, document fonts, non-root)"
uid=$(docker run --rm --entrypoint id "point-api:$v" -u)
if [ "$uid" = "0" ]; then fail "the api image runs as root"; fi
docker run --rm --memory 1536m \
  -v "$PWD/apps/api/scripts/render-smoke.mjs:/app/render-smoke.mjs:ro" \
  --entrypoint node "point-api:$v" render-smoke.mjs

# The SDKs are loaded by a dynamic import only when a DSN is set, so no test run starts them from the
# images: a package missing after `pnpm deploy --prod` would first show at a deploy (design D9 / D10).
echo "== The api image can load its Sentry SDK"
docker run --rm --entrypoint node -w /app "point-api:$v" \
  --input-type=module -e "await import('@sentry/nestjs')"

# The web server's SDK is bundled by Next.js into the standalone output, so the proof is the server
# itself: started with a DSN (instrumentation.ts register()), it answers a page, stays up and logs no
# missing module.
echo "== The web image starts with SENTRY_DSN_WEB set"
cid=$(docker run -d -p 3300:3000 \
  -e SITE_ORIGIN=https://point.test -e APP_ORIGIN=https://app.point.test \
  -e NEXT_PUBLIC_API_BASE=/api/v1 -e API_INTERNAL_BASE=http://127.0.0.1:9/api/v1 \
  -e INTERNAL_SSR_KEY=ci-only -e APP_ENV=staging \
  -e SENTRY_DSN_WEB=https://public@o0.ingest.sentry.io/2 \
  "point-web:$v")
trap 'docker rm -f "$cid" >/dev/null' EXIT
code=000
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: app.point.test' http://127.0.0.1:3300/login || true)
  [ "$code" != 000 ] && break
  sleep 1
done
sleep 3
log=$(docker logs "$cid" 2>&1 || true)
if [ "$code" = 000 ] || [ "$(docker inspect -f '{{.State.Running}}' "$cid")" != true ] \
  || grep -Eq 'ERR_MODULE_NOT_FOUND|Cannot find (module|package)' <<<"$log"; then
  echo "$log"
  fail "the web image did not start cleanly with a DSN (HTTP $code)"
fi
echo "web answered $code with a DSN set"
echo "all image checks passed for $v"
