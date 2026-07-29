#!/usr/bin/env bash
#
# Evakuators.am — PostgreSQL backup.
#
# Postgres runs on the same single VPS as the app, so without this a disk
# failure or one bad DELETE loses every registration, review and analytics
# counter with no way back.
#
# Install (as the user that owns backend/.env):
#
#   chmod +x scripts/backup-db.sh
#   crontab -e
#   30 3 * * * /srv/evakuators/scripts/backup-db.sh >> /var/log/evakuators-backup.log 2>&1
#
# Environment (all optional except a reachable DATABASE_URL):
#   BACKUP_DIR       where dumps are written        (default /var/backups/evakuators)
#   RETENTION_DAYS   how long to keep them          (default 14)
#   ENV_FILE         where to read DATABASE_URL from (default <repo>/backend/.env)
#   OFFSITE_CMD      command to copy the dump off this machine — see below
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/backend/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/evakuators}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# DATABASE_URL is read from backend/.env rather than duplicated in cron, so the
# credentials live in exactly one place. `set -a` exports what the file defines.
if [[ -z "${DATABASE_URL:-}" ]]; then
  [[ -f "$ENV_FILE" ]] || fail "no DATABASE_URL in the environment and no $ENV_FILE to read it from"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is empty"

command -v pg_dump >/dev/null || fail "pg_dump not found (apt install postgresql-client)"

mkdir -p "$BACKUP_DIR"
TARGET="$BACKUP_DIR/db-$(date +%F-%H%M).sql.gz"

# Write to a .partial file first and rename only on success. A cron job killed
# halfway through would otherwise leave a truncated .sql.gz that looks like a
# valid backup until the day someone tries to restore it.
log "dumping to $TARGET"
if ! pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$TARGET.partial"; then
  rm -f "$TARGET.partial"
  fail "pg_dump failed — NO backup was written"
fi
mv "$TARGET.partial" "$TARGET"

SIZE="$(du -h "$TARGET" | cut -f1)"
log "wrote $TARGET ($SIZE)"

# A dump that gzip can't even read is not a backup. This is a cheap integrity
# check, not a restore test — see the note at the bottom.
gzip -t "$TARGET" || fail "$TARGET is corrupt"

# Off-machine copy. A backup sitting on the same disk as the database does not
# survive the failure it exists for. Set OFFSITE_CMD to anything that takes the
# dump path as $1, for example:
#   OFFSITE_CMD='rclone copy "$1" remote:evakuators-backups'
#   OFFSITE_CMD='scp "$1" backup@other-host:/backups/'
if [[ -n "${OFFSITE_CMD:-}" ]]; then
  log "copying off-site"
  bash -c "$OFFSITE_CMD" _ "$TARGET" || log "WARNING: off-site copy failed — local dump kept"
else
  log "WARNING: OFFSITE_CMD is not set — this backup lives on the same disk as the database"
fi

# Prune old dumps last, so a failure above never deletes the previous good copy.
DELETED="$(find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete | wc -l)"
log "pruned $DELETED dump(s) older than $RETENTION_DAYS days"

log "done"

# ── Restoring ────────────────────────────────────────────────────────────────
#
# An untested backup is a guess. Do this once, now, and note how long it takes:
#
#   createdb evakuators_restore_test
#   gunzip -c /var/backups/evakuators/db-YYYY-MM-DD-HHMM.sql.gz \
#     | psql evakuators_restore_test
#   psql evakuators_restore_test -c 'SELECT count(*) FROM "TowTruck";'
#   dropdb evakuators_restore_test
#
# Note: this dumps PostgreSQL only. Tow truck photos live in Supabase Storage,
# which is a separate system with its own retention — a dump contains the rows
# that point at the images, not the images.
