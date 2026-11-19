#!/usr/bin/env bash
# Go back to a release this server ran before (add-staging-deploy design D6 · docs/ops/rollback.md):
#   rollback.sh <tag>        — started by rollback.yml through entry.sh, or on the server by the
#                              operator: sudo -u deploy /opt/point/infra/deploy/rollback.sh <tag>
# The tag must be in deploy-history.log as `ok`. No fetch (it works when GitHub cannot be reached) and
# never a migration (CG-DB-02: migrations are additive, so the older code runs on the newer schema).
set -euo pipefail

# The checkout below replaces this file on disk; bash has read all of main() before it runs.
main() {
  local tag="${1:?usage: rollback.sh <tag>}" image prefix missing=0 previous_commit previous_version

  # shellcheck source=lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  cd "$DEPLOY_ROOT"
  take_lock

  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { say "$tag is not a release tag"; exit 1; }
  if ! was_deployed_ok "$tag"; then
    say "$tag was never deployed here"
    exit 1
  fi

  previous_commit=$(git rev-parse HEAD)
  previous_version=$(env_value APP_VERSION)
  git checkout --quiet --detach "$tag"
  set_app_version "$tag"

  # The deploy keeps the images of the last three ok tags, so they are normally here already. Before
  # `up` the running containers are untouched: a failed pull puts the checkout and APP_VERSION back.
  prefix=$(env_value IMAGE_PREFIX)
  for image in api web backup; do
    docker image inspect "${prefix}point-$image:$tag" >/dev/null 2>&1 || missing=1
  done
  if [ "$missing" -eq 1 ] && ! compose pull --quiet api web backup; then
    git checkout --quiet --detach "$previous_commit"
    set_app_version "$previous_version"
    history_line rollback "$tag" failed
    say "pull failed — $previous_version is still running"
    exit 1
  fi

  if ! compose up -d --no-build || ! recreate_caddy_if_changed "$previous_commit"; then
    history_line rollback "$tag" failed
    say "starting $tag failed — see docs/ops/rollback.md, If it fails"
    exit 1
  fi

  if ! confirm_release "$tag"; then
    history_line rollback "$tag" failed
    say "rollback to $tag failed — see docs/ops/rollback.md, If it fails"
    exit 1
  fi
  history_line rollback "$tag" ok
  say "rollback $tag ok"
}

main "$@"
exit
