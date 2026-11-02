#!/usr/bin/env bash
# CI job deploy-script (add-staging-deploy design D17 · tasks 6.8–6.10, 7.1): the deploy, rollback and
# entry scripts and the pilot backup against a real server stack on the runner.
#   - a local registry (registry:2) holds the release images, as ghcr.io does for the pilot;
#   - a local bare repository is `origin`, with release tags on main:
#       v0.1.0  the commit under test
#       v0.2.0  + one test migration (table deploy_check)
#       v0.3.0  the same commit as v0.2.0 (the release that never becomes healthy)
#       v0.4.0  + a migration that fails
#   - $SERVER stands for /opt/point: a clone of origin with the server .env (APP_ENV=staging, mail to
#     the stack's own Mailpit, Caddy's local certificates);
#   - every command goes through infra/deploy/entry.sh with SSH_ORIGINAL_COMMAND, as the deploy key's.
# Run from the repository root. Each check prints `ok …`; the first failure ends the job.
set -euo pipefail

REPO=$PWD
WORK="${RUNNER_TEMP:-/tmp}/deploy-script"
ORIGIN="$WORK/origin.git"
SERVER="$WORK/point"
REGISTRY=localhost:5000
MIGRATION=20991231000000_deploy_check
BROKEN=20991231000001_deploy_broken

ok() { echo "ok    $*"; }
fail() {
  echo "::error::$*"
  exit 1
}
group() { echo "::group::$*"; }
endgroup() { echo "::endgroup::"; }

compose() {
  docker compose --project-directory "$SERVER" \
    -f "$SERVER/docker-compose.yml" -f "$SERVER/docker-compose.staging.yml" "$@"
}
# The deploy key's command: entry.sh with SSH_ORIGINAL_COMMAND; output in $OUT, status in $CODE.
entry() {
  CODE=0
  OUT=$(cd "$SERVER" && SSH_ORIGINAL_COMMAND="$1" bash infra/deploy/entry.sh 2>&1) || CODE=$?
  echo "$OUT" | sed 's/^/      | /'
}
expect_code() { [ "$CODE" -eq "$1" ] || fail "$2: exit $CODE, expected $1"; }
expect_out() { grep -qF -- "$1" <<<"$OUT" || fail "output does not contain: $1"; }
env_value() { sed -n "s/^$1=//p" "$SERVER/.env" | tail -n 1; }
status_version() {
  curl -sS --max-time 10 --resolve point.test:443:127.0.0.1 https://point.test/api/v1/system/status \
    | grep -o '"version":"[^"]*"' | cut -d'"' -f4
}
expect_version() {
  local got
  got=$(status_version || true)
  [ "$got" = "$1" ] || fail "status answers version ${got:-none}, expected $1"
  ok "status answers version $1"
}
sql() {
  compose exec -T postgres psql -U "$(env_value POSTGRES_USER)" -d "$(env_value POSTGRES_DB)" -tAc "$1"
}
head_commit() { git -C "$SERVER" rev-parse HEAD; }
tag_commit() { git -C "$SERVER" rev-parse "$1^{commit}"; }
last_history() { tail -n 1 "$SERVER/deploy-history.log"; }

rm -rf "$WORK"
mkdir -p "$WORK"

# ---------------------------------------------------------------------------------------------
group "Set-up: registry, origin with release tags, images, server checkout and .env (task 6.8)"

docker run -d --name registry -p 5000:5000 registry:2.8.3 >/dev/null

# Commits for v0.2.0 and v0.4.0 are made with a scratch index, so the working tree stays as it is.
export GIT_AUTHOR_NAME=ci GIT_AUTHOR_EMAIL=ci@point.test GIT_COMMITTER_NAME=ci GIT_COMMITTER_EMAIL=ci@point.test
commit_with_file() { # parent path content message
  local blob tree
  blob=$(printf '%s\n' "$3" | git hash-object -w --stdin)
  GIT_INDEX_FILE="$WORK/index" git read-tree "$1"
  GIT_INDEX_FILE="$WORK/index" git update-index --add --cacheinfo "100644,$blob,$2"
  tree=$(GIT_INDEX_FILE="$WORK/index" git write-tree)
  git commit-tree "$tree" -p "$1" -m "$4"
}
v1=$(git rev-parse HEAD)
v2=$(commit_with_file "$v1" "db/migrations/$MIGRATION/migration.sql" \
  'CREATE TABLE deploy_check (id integer PRIMARY KEY);' 'test: one more migration')
v4=$(commit_with_file "$v2" "db/migrations/$BROKEN/migration.sql" \
  'SELECT * FROM no_such_table;' 'test: a migration that fails')
# v0.1.1 is a tag on a side commit that main does not contain.
side=$(commit_with_file "$v1" "notes/side-branch.txt" 'a fix on another branch' 'test: off main')
git init -q --bare "$ORIGIN"
git push -q "$ORIGIN" "$v4:refs/heads/main" "$v1:refs/tags/v0.1.0" "$v2:refs/tags/v0.2.0" \
  "$v2:refs/tags/v0.3.0" "$v4:refs/tags/v0.4.0" "$side:refs/tags/v0.1.1"
ok "origin has main, tags v0.1.0 … v0.4.0 on it and v0.1.1 off it"

# v0.1.0 is built from the commit; the later tags are thin images on top of it with their own
# APP_VERSION and, for the api, the migration of their commit.
docker build -q -f apps/api/Dockerfile --build-arg APP_VERSION=v0.1.0 -t "$REGISTRY/point-api:v0.1.0" . >/dev/null
docker build -q -f apps/web/Dockerfile --build-arg APP_VERSION=v0.1.0 -t "$REGISTRY/point-web:v0.1.0" . >/dev/null
docker build -q --build-arg APP_VERSION=v0.1.0 -t "$REGISTRY/point-backup:v0.1.0" infra/backup >/dev/null
derive() { # image from-tag to-tag [migration-dir commit]
  local ctx="$WORK/ctx-$1-$3"
  mkdir -p "$ctx"
  {
    echo "FROM $REGISTRY/point-$1:$2"
    if [ -n "${4:-}" ]; then
      mkdir -p "$ctx/m"
      git show "$5:db/migrations/$4/migration.sql" > "$ctx/m/migration.sql"
      echo "COPY m/ /app/db/migrations/$4/"
    fi
    echo "ENV APP_VERSION=$3"
  } > "$ctx/Dockerfile"
  docker build -q -t "$REGISTRY/point-$1:$3" "$ctx" >/dev/null
}
derive api v0.1.0 v0.2.0 "$MIGRATION" "$v2"
derive api v0.2.0 v0.3.0
derive api v0.2.0 v0.4.0 "$BROKEN" "$v4"
for image in web backup; do
  derive "$image" v0.1.0 v0.2.0
  derive "$image" v0.2.0 v0.3.0
  derive "$image" v0.2.0 v0.4.0
done
for tag in v0.1.0 v0.2.0 v0.3.0 v0.4.0; do
  for image in api web backup; do docker push -q "$REGISTRY/point-$image:$tag" >/dev/null; done
done
# The server pulls them from the registry, as from ghcr.io.
docker image rm $(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep "^$REGISTRY/") >/dev/null
ok "images of the four tags are in the local registry only"

git clone -q "$ORIGIN" "$SERVER"
git -C "$SERVER" checkout -q --detach v0.1.0
owner=$(openssl rand -hex 16)
app=$(openssl rand -hex 16)
cp "$SERVER/.env.example" "$SERVER/.env"
sed -i \
  -e "s|change-me-owner|$owner|g" -e "s|change-me-app|$app|g" \
  -e "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=ci.apps.googleusercontent.com|" \
  -e "s|^GOOGLE_CLIENT_SECRET=.*|GOOGLE_CLIENT_SECRET=$(openssl rand -hex 16)|" \
  -e "s|^INTERNAL_SSR_KEY=.*|INTERNAL_SSR_KEY=$(openssl rand -hex 32)|" \
  -e "s|^INTERNAL_OPS_KEY=.*|INTERNAL_OPS_KEY=$(openssl rand -hex 32)|" \
  -e "s|^OTP_HMAC_SECRET=.*|OTP_HMAC_SECRET=$(openssl rand -hex 32)|" \
  -e "s|^AUDIT_HASH_SECRET=.*|AUDIT_HASH_SECRET=$(openssl rand -hex 32)|" \
  -e "s|^MAIL_PAYLOAD_KEY=.*|MAIL_PAYLOAD_KEY=$(openssl rand -base64 32)|" \
  -e "s|^APP_ENV=.*|APP_ENV=staging|" \
  -e "s|^MAIL_TRANSPORT=.*|MAIL_TRANSPORT=mailpit|" \
  -e "s|^SMTP_HOST=.*|SMTP_HOST=mailpit|" \
  -e "s|^RESEND_API_KEY=.*|RESEND_API_KEY=|" \
  -e "s|^IMAGE_PREFIX=.*|IMAGE_PREFIX=$REGISTRY/|" \
  -e "s|^CADDY_GLOBAL_OPTIONS=.*|CADDY_GLOBAL_OPTIONS=local_certs|" \
  "$SERVER/.env"
chmod 600 "$SERVER/.env"
grep -q change-me "$SERVER/.env" && fail "the CI server .env still holds change-me"

# Caddy first, alone, so its local CA exists and curl can trust it the way a phone trusts the real one.
compose up -d --no-deps caddy >/dev/null 2>&1
for _ in $(seq 1 30); do
  compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$WORK/caddy-root.crt" 2>/dev/null && break
  sleep 1
done
[ -s "$WORK/caddy-root.crt" ] || fail "Caddy's local root certificate did not appear"
export CURL_CA_BUNDLE="$WORK/caddy-root.crt"

entry "deploy v0.1.0"
expect_code 0 "first deploy of v0.1.0"
expect_version v0.1.0
endgroup

# ---------------------------------------------------------------------------------------------
group 'Spec "The deploy checks the server configuration before it changes anything" (task 6.10)'

cp "$SERVER/.env" "$WORK/env.before"
api_before=$(compose ps -q api)
sed -i '/^SENTRY_DSN_API=/d' "$SERVER/.env"
cp "$SERVER/.env" "$WORK/env.missing"
entry "deploy v0.2.0"
expect_code 1 "deploy with SENTRY_DSN_API missing"
expect_out "missing in .env: SENTRY_DSN_API"
[ "$(head_commit)" = "$(tag_commit v0.1.0)" ] || fail "the checkout moved"
cmp -s "$SERVER/.env" "$WORK/env.missing" || fail ".env changed"
[ "$(compose ps -q api)" = "$api_before" ] || fail "the api container changed"
expect_version v0.1.0
ok "Scenario: A release that needs a new variable"

cp "$WORK/env.before" "$SERVER/.env"
sed -i -e 's|^SENTRY_DSN_WEB=.*|SENTRY_DSN_WEB=https://public@o0.ingest.sentry.io/2|' \
  -e 's|^CADDY_CSP_CONNECT=.*|CADDY_CSP_CONNECT=|' "$SERVER/.env"
cp "$SERVER/.env" "$WORK/env.csp"
entry "deploy v0.2.0"
expect_code 1 "deploy with a web DSN and no connect origin"
expect_out "CADDY_CSP_CONNECT must be https://o0.ingest.sentry.io"
[ "$(head_commit)" = "$(tag_commit v0.1.0)" ] || fail "the checkout moved"
cmp -s "$SERVER/.env" "$WORK/env.csp" || fail ".env changed"
expect_version v0.1.0
ok "Scenario: The policy would block the error reports"
cp "$WORK/env.before" "$SERVER/.env"

# The server's own check that the tag is on main (design D5 step 1), behind release.yml's.
entry "deploy v0.1.1"
expect_code 1 "deploy of a tag off main"
expect_out "v0.1.1 is not on main"
[ "$(head_commit)" = "$(tag_commit v0.1.0)" ] || fail "the checkout moved"
expect_version v0.1.0
ok "a tag off main is refused on the server, nothing changed"
endgroup

# ---------------------------------------------------------------------------------------------
group 'Specs "The deploy runs the migrations before the new release starts" and "The deploy confirms the release it started" (task 6.9)'

entry "deploy v0.2.0"
expect_code 0 "deploy of v0.2.0"
expect_version v0.2.0
migrated=$(sql "SELECT extract(epoch FROM finished_at) FROM _prisma_migrations WHERE migration_name = '$MIGRATION'")
[ -n "$migrated" ] || fail "migration $MIGRATION is not in _prisma_migrations"
api=$(compose ps -q api)
[ "$(docker inspect -f '{{.Config.Image}}' "$api")" = "$REGISTRY/point-api:v0.2.0" ] || fail "api does not run point-api:v0.2.0"
created=$(date -d "$(docker inspect -f '{{.Created}}' "$api")" +%s.%N)
awk -v m="$migrated" -v c="$created" 'BEGIN { exit !(m < c) }' \
  || fail "the migration finished ($migrated) after the api container was created ($created)"
ok "the migration is recorded before the point-api:v0.2.0 container was created"
changed=$(diff "$WORK/env.before" "$SERVER/.env" | grep '^[<>]' || true)
[ "$changed" = $'< APP_VERSION=v0.1.0\n> APP_VERSION=v0.2.0' ] || fail ".env changed more than APP_VERSION: $changed"
ok "the only line of .env that changed is APP_VERSION=v0.2.0"
last_history | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+06:30 deploy v0.2.0 ok$' \
  || fail "history ends with: $(last_history)"
ok "the deploy history ends with <time +06:30> deploy v0.2.0 ok"
ok "Scenario: A release with a new migration · Scenario: A healthy release"
endgroup

# ---------------------------------------------------------------------------------------------
group 'Spec "Sign-in e-mails of the pilot server stay on the server" (task 6.10)'

compose exec -T api node dist/cli/admin-create.js --email aung@point.test --name-mm 'ကိုအောင်' \
  --name-en 'Ko Aung' --code E001 >/dev/null
answer=$(curl -sS --max-time 10 --resolve app.point.test:443:127.0.0.1 -w '\n%{http_code}' \
  -H 'Content-Type: application/json' -H 'X-Requested-With: point-app' -H 'Origin: https://app.point.test' \
  -d '{"email":"aung@point.test"}' https://app.point.test/api/v1/auth/otp/request)
[ "$(tail -n 1 <<<"$answer")" = 202 ] || fail "code request answered $(tail -n 1 <<<"$answer")"
grep -q '"resend_after_seconds":60' <<<"$answer" || fail "code request body: $answer"
ok "the code request answers 202 with resend_after_seconds 60"
inbox=""
for _ in $(seq 1 30); do
  inbox=$(compose exec -T api node -e \
    "fetch('http://mailpit:8025/api/v1/messages').then((r) => r.text()).then((t) => process.stdout.write(t))")
  grep -q '"total":1' <<<"$inbox" && break
  sleep 1
done
grep -q '"total":1' <<<"$inbox" && grep -q 'aung@point.test' <<<"$inbox" \
  || fail "Mailpit does not hold one message to aung@point.test: $inbox"
ok "the stack's Mailpit, read over the Docker network, holds one message to aung@point.test"
resend=$(compose exec -T api printenv RESEND_API_KEY) || fail "RESEND_API_KEY is not set in api"
[ -z "$resend" ] || fail "RESEND_API_KEY is not empty"
ok "RESEND_API_KEY is empty in the api container"
[ -z "$(docker port "$(compose ps -q mailpit)")" ] || fail "mailpit publishes a port"
ok "Scenario: A code request on the server stack"
endgroup

# ---------------------------------------------------------------------------------------------
group 'Spec "Rollback starts an earlier release without migrating" (task 6.10)'

entry "rollback v0.0.9"
expect_code 1 "rollback to a tag never deployed"
expect_out "v0.0.9 was never deployed here"
expect_version v0.2.0
ok "Scenario: An unknown tag is refused"

count=$(sql "SELECT count(*) FROM _prisma_migrations")
entry "rollback v0.1.0"
expect_code 0 "rollback to v0.1.0"
expect_version v0.1.0
[ "$(sql "SELECT count(*) FROM _prisma_migrations")" = "$count" ] || fail "_prisma_migrations changed"
last_history | grep -Eq ' rollback v0.1.0 ok$' || fail "history ends with: $(last_history)"
ok "Scenario: Back to the previous release ($count migrations before and after)"
endgroup

# ---------------------------------------------------------------------------------------------
group 'Spec "The deploy key runs only the deploy and rollback commands" (task 6.10)'

cp "$SERVER/.env" "$WORK/env.now"
here=$(head_commit)
api_before=$(compose ps -q api)
for command in 'deploy v0.2.0; cat .env' 'ls' 'deploy main'; do
  entry "$command"
  expect_code 1 "$command"
  [ "$OUT" = refused ] || fail "$command: output is not 'refused'"
  cmp -s "$SERVER/.env" "$WORK/env.now" || fail "$command: .env changed"
  [ "$(head_commit)" = "$here" ] || fail "$command: the checkout moved"
  [ "$(compose ps -q api)" = "$api_before" ] || fail "$command: the api container changed"
  ok "$command → refused, nothing changed"
done
ok "Scenario: Anything else is refused"
endgroup

# ---------------------------------------------------------------------------------------------
group 'The release that never becomes healthy, and the failing migration (task 6.10)'

entry "deploy v0.2.0"
expect_code 0 "deploy of v0.2.0 again (Scenario: A valid command)"
expect_version v0.2.0

cp "$SERVER/.env" "$WORK/env.good"
sed -i "s|^INTERNAL_SSR_KEY=.*|INTERNAL_SSR_KEY=abcdefghijklmno|" "$SERVER/.env"
started=$SECONDS
entry "deploy v0.3.0"
expect_code 1 "deploy of v0.3.0 with a 15-character INTERNAL_SSR_KEY"
[ $((SECONDS - started)) -ge 120 ] || fail "the deploy gave up before 120 s"
expect_out "rollback v0.2.0"
last_history | grep -Eq ' deploy v0.3.0 failed$' || fail "history ends with: $(last_history)"
ok "Scenario: A release that does not become healthy (gave up after $((SECONDS - started)) s, names rollback v0.2.0)"

cp "$WORK/env.good" "$SERVER/.env"
entry "rollback v0.2.0"
expect_code 0 "rollback to v0.2.0 after the failed start"
expect_version v0.2.0

entry "deploy v0.4.0"
expect_code 1 "deploy of v0.4.0 with a failing migration"
expect_out "migrate failed — v0.2.0 is still running"
expect_version v0.2.0
[ "$(head_commit)" = "$(tag_commit v0.2.0)" ] || fail "the checkout was not put back to v0.2.0"
[ "$(env_value APP_VERSION)" = v0.2.0 ] || fail "APP_VERSION was not put back to v0.2.0"
ok "Scenario: A failing migration stops the deploy"
endgroup

# ---------------------------------------------------------------------------------------------
group 'Spec "The pilot database is dumped to the backup bucket every night" (task 7.1)'

# A MinIO container stands for the owner's backup bucket; its root user stands for the bucket key.
bucket_user=ci-backup
bucket_password=$(openssl rand -hex 16)
docker run -d --name backup-bucket -p 9100:9000 -e MINIO_ROOT_USER="$bucket_user" \
  -e MINIO_ROOT_PASSWORD="$bucket_password" pgsty/minio:RELEASE.2026-08-04T00-00-00Z server /data >/dev/null
for _ in $(seq 1 30); do
  curl -sf http://127.0.0.1:9100/minio/health/ready >/dev/null && break
  sleep 1
done
sed -i -e 's|^S3_ENDPOINT=.*|S3_ENDPOINT=http://127.0.0.1:9100|' -e 's|^S3_REGION=.*|S3_REGION=us-east-1|' \
  -e 's|^S3_BUCKET_BACKUP=.*|S3_BUCKET_BACKUP=point-backup|' \
  -e "s|^BACKUP_S3_ACCESS_KEY_ID=.*|BACKUP_S3_ACCESS_KEY_ID=$bucket_user|" \
  -e "s|^BACKUP_S3_SECRET_ACCESS_KEY=.*|BACKUP_S3_SECRET_ACCESS_KEY=$bucket_password|" "$SERVER/.env"
bucket() {
  docker run --rm -i --network host -e RCLONE_CONFIG_B_TYPE=s3 -e RCLONE_CONFIG_B_PROVIDER=Other \
    -e RCLONE_CONFIG_B_ENDPOINT=http://127.0.0.1:9100 -e RCLONE_CONFIG_B_REGION=us-east-1 \
    -e RCLONE_CONFIG_B_ACCESS_KEY_ID="$bucket_user" -e RCLONE_CONFIG_B_SECRET_ACCESS_KEY="$bucket_password" \
    rclone/rclone:1.75.2 "$@"
}
bucket mkdir b:point-backup
backup() {
  CODE=0
  OUT=$(cd "$SERVER" && PILOT_BACKUP_DATE="$1" bash infra/pilot-backup/pilot-backup.sh 2>&1) || CODE=$?
  echo "$OUT" | sed 's/^/      | /'
}

backup 2026-10-06
expect_code 0 "the backup of 06/Oct/2026"
grep -Eq '^pilot-backup ok pilot/daily/point-2026-10-06\.dump [1-9][0-9]*$' <<<"$OUT" \
  || fail "the backup did not report ok with a size"
bucket cat b:point-backup/pilot/daily/point-2026-10-06.dump \
  | compose exec -T postgres pg_restore --list >/dev/null || fail "pg_restore --list cannot read the dump"
ok "Scenario: The nightly dump — pilot/daily/point-2026-10-06.dump exists, is not empty and pg_restore reads it"

# The operator's restore drill (backup-restore.md, "Pilot") — the same script.
source_users=$(sql "SELECT count(*) FROM users")
CODE=0
OUT=$(cd "$SERVER" && bash infra/pilot-backup/restore-check.sh 2026-10-06 2>&1) || CODE=$?
echo "$OUT" | sed 's/^/      | /'
expect_code 0 "the restore drill of the 06/Oct dump"
expect_out "restore-check ok pilot/daily/point-2026-10-06.dump: users $source_users in the dump, $source_users now"
[ "$(sql "SELECT count(*) FROM pg_database WHERE datname = 'restore_check'")" = 0 ] \
  || fail "the scratch database was not dropped"
ok "Scenario: The dump restores — users $source_users in the restore and in the source"

before=$(bucket hashsum md5 b:point-backup/pilot/daily/point-2026-10-06.dump)
cp "$SERVER/.env" "$WORK/env.bucket"
sed -i 's|^S3_ENDPOINT=.*|S3_ENDPOINT=http://127.0.0.1:9|' "$SERVER/.env"
backup 2026-10-07
cp "$WORK/env.bucket" "$SERVER/.env"
expect_code 1 "the backup of 07/Oct/2026 with the endpoint refusing connections"
expect_out "pilot-backup FAILED upload"
[ "$(bucket lsf -R b:point-backup/pilot/daily/)" = "point-2026-10-06.dump" ] \
  || fail "the bucket holds more than the 06/Oct dump: $(bucket lsf -R b:point-backup/pilot/daily/)"
[ "$(bucket hashsum md5 b:point-backup/pilot/daily/point-2026-10-06.dump)" = "$before" ] \
  || fail "the 06/Oct dump changed"
ok "Scenario: The bucket is unreachable — FAILED upload, no 07/Oct object, the 06/Oct object unchanged"

# A dump that fails after the upload began leaves a partial object, which the script deletes. Last,
# because it stops the database.
compose stop postgres >/dev/null 2>&1
backup 2026-10-08
compose start postgres >/dev/null 2>&1
expect_code 1 "the backup of 08/Oct/2026 with postgres stopped"
expect_out "pilot-backup FAILED dump"
[ "$(bucket lsf -R --files-only b:point-backup/pilot/)" = "daily/point-2026-10-06.dump" ] \
  || fail "a partial or 08/Oct object remains: $(bucket lsf -R --files-only b:point-backup/pilot/)"
ok "a failed dump leaves no partial object and no 08/Oct object"
endgroup

echo "deploy-script: every scenario passed"
