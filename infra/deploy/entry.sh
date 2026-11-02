#!/usr/bin/env bash
# The forced command of the deploy key (add-staging-deploy design D5 · spec "The deploy key runs only
# the deploy and rollback commands"). The deploy user's authorized_keys line is
#   command="/opt/point/infra/deploy/entry.sh",restrict ssh-ed25519 AAAA… point-deploy
# so whatever the client asks for arrives here in SSH_ORIGINAL_COMMAND. Exactly `deploy <tag>` or
# `rollback <tag>` is accepted; anything else is refused before anything changes.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# [[ =~ ]] anchors ^ and $ to the whole string, so a second line or a `;` never matches.
accepted='^(deploy|rollback) (v[0-9]+\.[0-9]+\.[0-9]+)$'

if [[ "${SSH_ORIGINAL_COMMAND-}" =~ $accepted ]]; then
  exec "$here/${BASH_REMATCH[1]}.sh" "${BASH_REMATCH[2]}"
fi
echo refused >&2
exit 1
