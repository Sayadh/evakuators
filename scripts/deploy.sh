#!/usr/bin/env bash
#
# Evakuators.am — one-command deploy (2026-11-17).
#
#   scripts/deploy.sh staging              # in /var/www/evakuators-staging
#   scripts/deploy.sh production           # in production's checkout; asks to type "production"
#   scripts/deploy.sh staging --force      # rebuild even if git pull brought nothing
#
# Runs the routine deploy of docs/deployment.md as ONE fail-fast sequence:
#   pull (fast-forward only) → backend: install if the lockfile changed,
#   prisma generate, [production: database backup if migrations changed],
#   migrate deploy, build, check:di → frontend: install if needed, build →
#   pm2 restart of THIS environment's ecosystem file → health check.
#
# Nothing is restarted unless every build succeeded: a failed step leaves the
# running processes on the previous build (the «half-deployed frontend» trap
# in docs/deployment.md cannot happen). On any failure it prints the exact
# rollback commands. Migrations are never rolled back automatically — they are
# additive by convention in this repo, so old code runs on the new schema.
#
set -Eeuo pipefail

ENVIRONMENT="${1:-}"
FORCE="${2:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

case "$ENVIRONMENT" in
  staging)
    ECOSYSTEM="ecosystem.staging.config.js"; BACKEND_PORT=4003; FRONTEND_PORT=3003
    [[ "$REPO_ROOT" == *staging* ]] || { echo "✖ This checkout ($REPO_ROOT) does not look like staging's. Refusing." >&2; exit 1; }
    ;;
  production)
    ECOSYSTEM="ecosystem.config.js"; BACKEND_PORT=4002; FRONTEND_PORT=3002
    [[ "$REPO_ROOT" != *staging* ]] || { echo "✖ This is staging's checkout ($REPO_ROOT). Refusing a production deploy from it." >&2; exit 1; }
    read -r -p "Deploying to PRODUCTION (evakuators.am). Type \"production\" to continue: " answer
    [[ "$answer" == "production" ]] || { echo "Cancelled."; exit 1; }
    ;;
  *)
    echo "usage: scripts/deploy.sh staging|production [--force]" >&2
    exit 1
    ;;
esac

START=$(date +%s)
step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
PREV="$(git rev-parse HEAD)"
RESTARTED=0

on_error() {
  local line=$1
  # The ( backend ) / ( frontend ) subshells inherit this trap (set -E): let the
  # outer shell report once, not every level.
  (( BASH_SUBSHELL > 0 )) && return
  echo
  echo "✖ Deploy FAILED (line $line)."
  if [[ "$RESTARTED" == 0 ]]; then
    echo "  Nothing was restarted — the site is still running the previous build ($PREV)."
  else
    echo "  The processes WERE restarted. Look first: pm2 logs --lines 80"
  fi
  echo "  To go back to the previous commit:"
  echo "    cd $REPO_ROOT && git reset --hard $PREV && scripts/deploy.sh $ENVIRONMENT --force"
  echo "  (Database migrations are not undone; they are additive, the old code runs on them.)"
}
trap 'on_error $LINENO' ERR

step "Checking the working tree"
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  git status --short --untracked-files=no
  echo "✖ Local changes in tracked files on the server. Commit or discard them first (git stash / git checkout -- <file>)." >&2
  exit 1
fi

step "git pull --ff-only"
git pull --ff-only
NEW="$(git rev-parse HEAD)"
if [[ "$PREV" == "$NEW" && "$FORCE" != "--force" ]]; then
  echo "Already up to date ($NEW). Nothing to deploy. (Use --force to rebuild anyway.)"
  exit 0
fi
CHANGED="$(git diff --name-only "$PREV" "$NEW" || true)"
changed() { grep -qE "$1" <<<"$CHANGED"; }
if [[ "$PREV" != "$NEW" ]]; then
  echo "Commits:"
  git log --oneline "$PREV..$NEW" | head -30
fi

step "Backend"
(
  cd backend
  if changed '^backend/package-lock\.json$' || [[ ! -d node_modules ]]; then npm ci; else echo "dependencies unchanged — skipping npm ci"; fi
  # Always: a stale Prisma Client is the «property does not exist» trap.
  # Through npm run (the project's own Prisma), never a bare `npx prisma` —
  # with no local copy, npx would fetch whatever major version is newest.
  npm run prisma:generate
  if changed '^backend/prisma/migrations/'; then
    echo "New migrations:"; grep -E '^backend/prisma/migrations/' <<<"$CHANGED" | cut -d/ -f4 | sort -u
  fi
  # Production: back up before ANY run that may migrate — new migrations in
  # this pull, or a --force re-run (a previous deploy may have pulled them and
  # failed before `prisma:deploy`, so this pull shows nothing new).
  if [[ "$ENVIRONMENT" == "production" ]] && { changed '^backend/prisma/migrations/' || [[ "$FORCE" == "--force" ]]; }; then
    echo "Taking a database backup before migrating…"
    "$REPO_ROOT/scripts/backup-db.sh"
  fi
  npm run prisma:deploy
  npm run build
  npm run check:di
)

step "Frontend"
(
  cd frontend
  if changed '^frontend/package-lock\.json$' || [[ ! -d node_modules ]]; then npm ci; else echo "dependencies unchanged — skipping npm ci"; fi
  npm run build
)

step "Restarting ($ECOSYSTEM)"
RESTARTED=1
# startOrRestart, not restart: a process the ecosystem file defines but PM2 is
# not running yet (the worker, the first time) is started instead of skipped.
pm2 startOrRestart "$ECOSYSTEM" --update-env

step "Health check"
ok_backend=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$BACKEND_PORT/api/v1/health" | grep -q '"database":"up"'; then ok_backend=1; break; fi
  sleep 2
done
[[ "$ok_backend" == 1 ]] || { echo "✖ Backend on :$BACKEND_PORT is not healthy after 60 s"; false; }
echo "backend :$BACKEND_PORT ✓ (database up)"
ok_frontend=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 -o /dev/null "http://127.0.0.1:$FRONTEND_PORT/"; then ok_frontend=1; break; fi
  sleep 2
done
[[ "$ok_frontend" == 1 ]] || { echo "✖ Frontend on :$FRONTEND_PORT does not answer after 60 s"; false; }
echo "frontend :$FRONTEND_PORT ✓"

trap - ERR
echo
echo "✔ $ENVIRONMENT deployed: ${PREV:0:7} → ${NEW:0:7} in $(( $(date +%s) - START )) s"
echo "  Worker: check it beats — pm2 logs $( [[ $ENVIRONMENT == staging ]] && echo evakuators-worker-staging || echo evakuators-worker ) --lines 5"
