#!/usr/bin/env bash
#
# Evakuators.am — copy one database dump to Supabase Storage, ENCRYPTED, and
# prune that bucket to the last RETENTION_DAYS (2026-11-17).
#
# Called by backup-db.sh as its built-in off-site step when SUPABASE_BACKUP_URL
# is set (it can also be run by hand: backup-offsite-supabase.sh <dump.sql.gz>).
#
# The dump holds phone numbers and password hashes, so it never leaves this
# machine in the clear: AES-256 with BACKUP_ENCRYPTION_KEY (openssl, PBKDF2).
# Without that key the script refuses to upload. KEEP THE KEY SOMEWHERE ELSE
# TOO (a password manager) — a backup you cannot decrypt is not a backup.
#
# Environment (read from backend/.env by backup-db.sh):
#   SUPABASE_BACKUP_URL          https://<project>.supabase.co
#   SUPABASE_BACKUP_SERVICE_KEY  the project's service_role key (Settings → API)
#   SUPABASE_BACKUP_BUCKET       a PRIVATE bucket            (default evakuators-backups)
#   SUPABASE_BACKUP_PREFIX       folder inside it, per box   (default db)
#   BACKUP_ENCRYPTION_KEY        long random passphrase:     openssl rand -base64 48
#   RETENTION_DAYS               how many days to keep there (default 14)
#
# Decrypt a downloaded copy:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
#     -in db-YYYY-MM-DD-HHMM.sql.gz.enc | gunzip | psql <target-db>
#
set -euo pipefail

DUMP="${1:?usage: backup-offsite-supabase.sh <dump.sql.gz>}"
[[ -f "$DUMP" ]] || { echo "no such file: $DUMP" >&2; exit 1; }
: "${SUPABASE_BACKUP_URL:?SUPABASE_BACKUP_URL is not set}"
: "${SUPABASE_BACKUP_SERVICE_KEY:?SUPABASE_BACKUP_SERVICE_KEY is not set}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is not set — refusing to upload an unencrypted dump}"
BUCKET="${SUPABASE_BACKUP_BUCKET:-evakuators-backups}"
PREFIX="${SUPABASE_BACKUP_PREFIX:-db}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BASE="${SUPABASE_BACKUP_URL%/}/storage/v1"
AUTH=(-H "Authorization: Bearer $SUPABASE_BACKUP_SERVICE_KEY" -H "apikey: $SUPABASE_BACKUP_SERVICE_KEY")

command -v openssl >/dev/null || { echo "openssl not found" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl not found" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 not found" >&2; exit 1; }

ENC="$(mktemp --suffix=.enc)"
trap 'rm -f "$ENC"' EXIT
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "$DUMP" -out "$ENC"

NAME="$PREFIX/$(basename "$DUMP").enc"
# --fail-with-body: a 4xx/5xx is a failure, and its message reaches the log
curl --silent --show-error --fail-with-body --max-time 600 \
  "${AUTH[@]}" -H "Content-Type: application/octet-stream" -H "x-upsert: true" \
  --data-binary "@$ENC" "$BASE/object/$BUCKET/$NAME" >/dev/null
echo "uploaded $NAME ($(du -h "$ENC" | cut -f1))"

# Prune: list the folder, delete what is older than RETENTION_DAYS. A failure
# here is only a warning — the upload above already succeeded.
LIST="$(curl --silent --show-error --fail-with-body --max-time 60 "${AUTH[@]}" -H "Content-Type: application/json" \
  -d "{\"prefix\":\"$PREFIX\",\"limit\":1000,\"sortBy\":{\"column\":\"created_at\",\"order\":\"asc\"}}" \
  "$BASE/object/list/$BUCKET")" || { echo "WARNING: could not list $BUCKET for pruning" >&2; exit 0; }
OLD="$(PREFIX="$PREFIX" RETENTION_DAYS="$RETENTION_DAYS" python3 -c '
import json, os, sys
from datetime import datetime, timedelta, timezone
cutoff = datetime.now(timezone.utc) - timedelta(days=int(os.environ["RETENTION_DAYS"]))
names = []
for item in json.load(sys.stdin):
    created = item.get("created_at")
    if not created or not item.get("id"):
        continue  # a folder, not a file
    if datetime.fromisoformat(created.replace("Z", "+00:00")) < cutoff:
        names.append(os.environ["PREFIX"] + "/" + item["name"])
print(json.dumps({"prefixes": names}))
' <<<"$LIST")"
if [[ "$OLD" != '{"prefixes": []}' ]]; then
  curl --silent --show-error --fail-with-body --max-time 60 -X DELETE "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "$OLD" "$BASE/object/$BUCKET" >/dev/null || echo "WARNING: pruning failed" >&2
  echo "pruned: $OLD"
fi
