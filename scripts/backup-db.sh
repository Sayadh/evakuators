#!/usr/bin/env bash
#
# Evakuators.am — PostgreSQL + photo backup.
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
#   MEDIA_DIR        the photos directory           (default: read from ENV_FILE)
#   MEDIA_OFFSITE_CMD  same as OFFSITE_CMD, for the photo snapshot DIRECTORY
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

# ── Photos ───────────────────────────────────────────────────────────────────
#
# Tow truck photos live on this disk (MEDIA_DIR, see docs/deployment.md § "Image
# storage"), so they need a backup exactly like the database: a dump restores
# rows that point at files, not the files.
#
# Each run is a full, browsable snapshot directory, but costs only the photos
# added since the previous one: unchanged files are hard links into the last
# snapshot (rsync --link-dest). Photos are never modified after upload, so this
# is cheap even with daily runs and 14 days of retention.
MEDIA_DIR="${MEDIA_DIR:-$( [[ -f "$ENV_FILE" ]] && sed -n 's/^MEDIA_DIR=//p' "$ENV_FILE" | tr -d "\"'" || true)}"

if [[ -n "$MEDIA_DIR" && -d "$MEDIA_DIR" ]]; then
  command -v rsync >/dev/null || fail "rsync not found (apt install rsync)"

  MEDIA_TARGET="$BACKUP_DIR/media-$(date +%F-%H%M)"
  PREVIOUS="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'media-*' ! -name '*.partial' | sort | tail -n 1)"
  LINK_DEST=()
  [[ -n "$PREVIOUS" ]] && LINK_DEST=(--link-dest="$PREVIOUS")

  log "snapshotting photos to $MEDIA_TARGET"
  rm -rf "$MEDIA_TARGET.partial"
  if ! rsync -a --exclude='*.tmp' "${LINK_DEST[@]}" "$MEDIA_DIR"/ "$MEDIA_TARGET.partial"/; then
    rm -rf "$MEDIA_TARGET.partial"
    fail "photo snapshot failed — the database dump above WAS written"
  fi
  mv "$MEDIA_TARGET.partial" "$MEDIA_TARGET"
  # rsync -a copies MEDIA_DIR's own mtime onto the snapshot directory, which
  # can be weeks old — the prune below would then delete the snapshot it just
  # made. Stamp it with now.
  touch "$MEDIA_TARGET"
  log "wrote $MEDIA_TARGET ($(find "$MEDIA_TARGET" -type f | wc -l) photos)"

  if [[ -n "${MEDIA_OFFSITE_CMD:-}" ]]; then
    # e.g. MEDIA_OFFSITE_CMD='rclone sync "$1" remote:evakuators-media'
    log "copying photos off-site"
    bash -c "$MEDIA_OFFSITE_CMD" _ "$MEDIA_TARGET" || log "WARNING: off-site photo copy failed — local snapshot kept"
  else
    log "WARNING: MEDIA_OFFSITE_CMD is not set — photos are backed up on the same disk only"
  fi

  PRUNED_MEDIA="$(find "$BACKUP_DIR" -maxdepth 1 -type d -name 'media-*' -mtime "+$RETENTION_DAYS" -print -exec rm -rf {} + | wc -l)"
  log "pruned $PRUNED_MEDIA photo snapshot(s) older than $RETENTION_DAYS days"
else
  log "WARNING: MEDIA_DIR is not set or does not exist — photos were NOT backed up"
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
# Photos: a snapshot is a plain directory tree — restore is a copy back:
#
#   rsync -a /var/backups/evakuators/media-YYYY-MM-DD-HHMM/ /var/www/evakuators-media/
#
# Restore the dump and the snapshot from the SAME run, so every row's file exists.
