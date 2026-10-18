#!/usr/bin/env bash
# Deploy recipe for sats-man.
#
# Run by the host deploy watcher (nostr-deploy-watch) after it fast-forwards
# this checkout to the tip published on Nostr. The watcher owns pulling from the
# GRASP servers, the service and public-URL inventory, and the post-deploy URL
# check; this file owns everything specific to building and activating sats-man.
#
# Contract:
#   - runs as the deploy user, with the repository root as the working directory
#   - exits non-zero on any failure, so the watcher records a failed deploy
#   - leaves no tracked file modified: a dirty checkout cannot be fast-forwarded
#
# Mode flags are build and runtime inputs, not checked-in state. The old shared
# deploy script rewrote src/config/gameConfig.ts in place and left it modified,
# and that drift is what eventually stopped this checkout fast-forwarding. Here
# the rewrite is restored on the way out, whatever happens.
set -euo pipefail

cd "$(dirname "$0")/.."

APP=sats-man
SERVICE="${APP}.service"
FREE_MODE="${SATSMAN_FREE_MODE:-false}"
TEST_MODE="${SATSMAN_TEST_MODE:-false}"
log() { printf '[%s] %s\n' "$APP" "$*"; }

# Tracked files only: an untracked build artefact or helper script sits happily
# there and does not stop git taking the tip, so it is not a reason to refuse.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "refusing to deploy: the checkout has modified tracked files"
  git status --porcelain --untracked-files=no
  exit 1
fi

restore_tracked() {
  git checkout -- src/config/gameConfig.ts 2>/dev/null || true
}
trap restore_tracked EXIT

log "configuring freePlay=${FREE_MODE}, testMode=${TEST_MODE}"

# gameConfig.ts is client-side and baked into the build.
sed -i "s/freePlayEnabled: true,/freePlayEnabled: ${FREE_MODE},/" src/config/gameConfig.ts
sed -i "s/freePlayEnabled: false,/freePlayEnabled: ${FREE_MODE},/" src/config/gameConfig.ts
sed -i "s/testMode: true,/testMode: ${TEST_MODE},/" src/config/gameConfig.ts
sed -i "s/testMode: false,/testMode: ${TEST_MODE},/" src/config/gameConfig.ts

# .env is gitignored and read by the server at runtime.
if grep -q "^SATSMAN_TEST_MODE=" .env 2>/dev/null; then
  sed -i "s/^SATSMAN_TEST_MODE=.*/SATSMAN_TEST_MODE=${TEST_MODE}/" .env
else
  echo "SATSMAN_TEST_MODE=${TEST_MODE}" >> .env
fi

log "building $(git rev-parse --short HEAD)"
npm ci --no-audit --no-fund
npm run build

log "restarting $SERVICE"
sudo systemctl restart "$SERVICE"
if ! systemctl is-active --quiet "$SERVICE"; then
  log "$SERVICE is not running after the restart"
  sudo systemctl status "$SERVICE" --no-pager | tail -20 || true
  exit 1
fi

# The unit reports active before it binds its port, and the watcher checks the
# public URL as soon as this exits: wait for the app to answer locally first,
# otherwise a healthy deploy is recorded as a 502 failure.
code=""
for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:3002/" 2>/dev/null)
  case "$code" in 2*) break ;; esac
  sleep 1
done
if [ "${code#2}" = "$code" ]; then
  log "$SERVICE is active but has not answered on 127.0.0.1:3002 after 30s (last HTTP ${code:-none})"
  sudo journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null | tail -10 || true
  exit 1
fi
log "answering on 127.0.0.1:3002 (HTTP $code)"

log "deployed $(git rev-parse --short HEAD)"
