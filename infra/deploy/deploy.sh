#!/usr/bin/env bash
# Deploy a release tag on the pilot server (add-staging-deploy design D5 · docs/ops/deploy.md):
#   deploy.sh <tag>          — started by release.yml through entry.sh, or by the operator as `deploy`
# In this order: the tag is on main → the server .env fits the tag's .env.example (nothing has changed
# yet) → check out the tag, APP_VERSION → pull → migrate (on failure the previous release keeps
# running and is put back) → up → confirm health and version → history line → prune old images.
# It never rolls back by itself: a failed start prints the rollback command for a person to decide.
set -euo pipefail

# The checkout below replaces this file on disk; bash has read all of main() before it runs.
main() {
  local tag="${1:?usage: deploy.sh <tag>}" commit problems previous_commit previous_version previous_ok

  # shellcheck source=lib.sh
  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
  cd "$DEPLOY_ROOT"
  take_lock

  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { say "$tag is not a release tag"; exit 1; }

  # 1. The tag's commit is on main — the second check after release.yml's.
  git fetch --quiet origin main --tags
  commit=$(git rev-parse --verify --quiet "$tag^{commit}") || { say "$tag does not exist"; exit 1; }
  git merge-base --is-ancestor "$commit" origin/main || { say "$tag is not on main"; exit 1; }

  # 2. The configuration check, against the release's own .env.example.
  problems=$(config_problems <(git show "$tag:.env.example") .env)
  if [ -n "$problems" ]; then
    say "$problems"
    say "nothing was changed — fix .env and run the deploy again"
    exit 1
  fi

  previous_commit=$(git rev-parse HEAD)
  previous_version=$(env_value APP_VERSION)
  previous_ok=$(ok_tags | tail -n 1)
  previous_ok="${previous_ok:-$previous_version}"

  # Before `up`, the running containers are untouched: a failure puts the checkout and APP_VERSION back.
  put_back() {
    git checkout --quiet --detach "$previous_commit"
    set_app_version "$previous_version"
    history_line deploy "$tag" failed
    say "$1 — $previous_version is still running"
    exit 1
  }

  # 3. Checkout and APP_VERSION.
  git checkout --quiet --detach "$tag"
  set_app_version "$tag"

  # 4. The release's images (migrate uses point-api).
  compose pull --quiet api web backup || put_back "pull failed"

  # 5. Migrations before the new code (CG-DB-01); additive, so the running release keeps working.
  compose --profile tools run --rm migrate || put_back "migrate failed"

  # 6. Start the release.
  compose up -d --no-build

  # 7–8. Confirm, record.
  if ! confirm_release "$tag"; then
    history_line deploy "$tag" failed
    say "deploy of $tag failed — to go back: rollback $previous_ok"
    exit 1
  fi
  history_line deploy "$tag" ok

  # 9. Disk: the images of the last three tags deployed ok stay.
  prune_images
  say "deploy $tag ok"
}

main "$@"
exit
