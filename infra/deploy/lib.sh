# shellcheck shell=bash
# Shared by deploy.sh and rollback.sh (add-staging-deploy design D5 / D6). Sourced, never run. The
# functions work in the checkout the scripts live in (/opt/point on the pilot server): its .env, its
# deploy-history.log (git-ignored) and the server stack = docker-compose.yml + docker-compose.staging.yml.

DEPLOY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
HISTORY="$DEPLOY_ROOT/deploy-history.log"
# The api health check is 12 tries, 10 s apart (docker-compose.yml): at most 120 s (spec).
HEALTH_TIMEOUT_SECONDS=120

compose() {
  docker compose --project-directory "$DEPLOY_ROOT" \
    -f "$DEPLOY_ROOT/docker-compose.yml" -f "$DEPLOY_ROOT/docker-compose.staging.yml" "$@"
}

say() { printf '%s\n' "$*"; }

# The value of NAME in an env file (default: the server .env); the last line wins, as for Compose.
env_value() {
  local name="$1" file="${2:-$DEPLOY_ROOT/.env}" value
  value=$(sed -n "s/^${name}=//p" "$file" | tail -n 1)
  value="${value%$'\r'}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf '%s' "$value"
}

# The variables an .env.example lists, without the ones under a `# reserved:` line (the block runs to
# the next blank line — the same rule as tools/guards/check-env-example.mjs).
required_variables() {
  awk '
    /^[[:space:]]*$/ { reserved = 0; next }
    /^[[:space:]]*#/ { if ($0 ~ /^[[:space:]]*#[[:space:]]*reserved:/) reserved = 1; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ { if (!reserved) { sub(/=.*/, ""); print } }
  ' "$1"
}

# scheme://host[:port] of a URL — the DSN's user part and path dropped.
origin_of() {
  local url="$1" rest
  [ -z "$url" ] && return 0
  rest="${url#*://}"
  rest="${rest#*@}"
  printf '%s://%s' "${url%%://*}" "${rest%%/*}"
}

# Spec "The deploy checks the server configuration before it changes anything": one line per problem,
# nothing when the server .env fits the release's .env.example.
config_problems() {
  local example="$1" env_file="$2" name expected actual
  while IFS= read -r name; do
    grep -q "^${name}=" "$env_file" || say "missing in .env: $name"
  done < <(required_variables "$example")
  while IFS= read -r name; do
    say "change-me in .env: $name"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=.*change-me' "$env_file" | sed 's/=.*//')
  expected=$(origin_of "$(env_value SENTRY_DSN_WEB "$env_file")")
  actual=$(env_value CADDY_CSP_CONNECT "$env_file")
  if [ "$actual" != "$expected" ]; then
    if [ -z "$expected" ]; then
      say "CADDY_CSP_CONNECT must be empty while SENTRY_DSN_WEB is empty"
    else
      say "CADDY_CSP_CONNECT must be $expected"
    fi
  fi
}

# Rewrites only the APP_VERSION line of the server .env (sed -i keeps the file's mode 600).
set_app_version() {
  sed -i "s/^APP_VERSION=.*/APP_VERSION=$1/" "$DEPLOY_ROOT/.env"
}

# Myanmar time has no daylight saving: the POSIX zone string needs no tz database on the host.
now_mmt() { TZ=MMT-6:30 date +%Y-%m-%dT%H:%M:%S%:z; }

# <time MMT> deploy|rollback <tag> ok|failed
history_line() { say "$(now_mmt) $1 $2 $3" >> "$HISTORY"; }

# The tags deployed or rolled back to `ok` on this server, newest last, each once.
ok_tags() {
  [ -f "$HISTORY" ] || return 0
  awk '$4 == "ok" { last[$3] = NR } END { for (t in last) print last[t], t }' "$HISTORY" \
    | sort -n | cut -d' ' -f2
}

was_deployed_ok() { ok_tags | grep -qxF "$1"; }

# host and port of an origin, for curl --resolve <host>:<port>:127.0.0.1 (through the local Caddy).
resolve_arg() {
  local hostport="${1#*://}"
  hostport="${hostport%%/*}"
  if [[ "$hostport" == *:* ]]; then say "${hostport%:*}:${hostport##*:}:127.0.0.1"; else say "$hostport:443:127.0.0.1"; fi
}

# Spec "The deploy confirms the release it started": the api container reports healthy within 120 s,
# then health answers ok on the staff host and status answers the tag on the public host — both through
# Caddy, as a phone would reach them.
confirm_release() {
  local tag="$1" app site deadline id state health status
  app=$(env_value APP_ORIGIN)
  site=$(env_value SITE_ORIGIN)
  deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
  state=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    id=$(compose ps -q api 2>/dev/null || true)
    state=$([ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || true)
    [ "$state" = healthy ] && break
    sleep 5
  done
  if [ "$state" != healthy ]; then
    say "api did not report healthy within ${HEALTH_TIMEOUT_SECONDS} s (last state: ${state:-none})"
    return 1
  fi
  health=$(curl -sS --max-time 10 --resolve "$(resolve_arg "$app")" "$app/api/v1/health" || true)
  if ! grep -q '"status":"ok"' <<<"$health"; then
    say "health on $app did not answer ok: ${health:-no answer}"
    return 1
  fi
  status=$(curl -sS --max-time 10 --resolve "$(resolve_arg "$site")" "$site/api/v1/system/status" || true)
  if ! grep -q "\"version\":\"$tag\"" <<<"$status"; then
    say "status on $site does not answer version $tag: ${status:-no answer}"
    return 1
  fi
  say "$tag is running: health ok, status version $tag"
}

# Design D5 step 9: keep the images of the last three tags deployed ok (and the one running); remove
# older release images of the three services. An image still in use is left alone.
prune_images() {
  local prefix keep image tag
  prefix=$(env_value IMAGE_PREFIX)
  keep=$( (ok_tags | tail -n 3; env_value APP_VERSION) | sort -u)
  while IFS= read -r image; do
    tag="${image##*:}"
    if ! grep -qxF "$tag" <<<"$keep"; then
      docker image rm "$image" >/dev/null 2>&1 && say "removed image $image" || true
    fi
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' \
    | grep -E "^${prefix//./\\.}point-(api|web|backup):v[0-9]+\.[0-9]+\.[0-9]+$" || true)
}

# Runs a command with its output in the server journal (tag point-deploy) instead of the deploy job's
# log, which is public while the repository is: migrate output can carry row values (CG-SEC-11).
journal() {
  "$@" 2>&1 | logger -t point-deploy
}

# `up -d` does not re-read a bind-mounted file that the checkout replaced: when infra/caddy changed
# between the release that ran and this one, Caddy is recreated so the new policy is served.
recreate_caddy_if_changed() {
  git diff --quiet "$1" HEAD -- infra/caddy && return 0
  say "infra/caddy changed — recreating caddy"
  compose up -d --no-build --force-recreate caddy
}

# The rollback hint after a failed start: none when no release has run here successfully yet.
go_back_hint() {
  if [[ "${1:-}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    say "to go back: rollback $1"
  else
    say "no earlier release ran here — fix the cause and deploy again"
  fi
}

# One deploy or rollback at a time on the server, also when the operator starts one by hand.
take_lock() {
  exec 9>"$DEPLOY_ROOT/.deploy.lock"
  if ! flock -n 9; then
    say "another deploy or rollback is running"
    exit 1
  fi
}
