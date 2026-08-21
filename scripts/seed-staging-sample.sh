#!/usr/bin/env bash
#
# Evakuators.am — copy a small, REAL sample from production into staging.
#
# For when a full refresh-staging-db.sh is more than you need: this copies
# only the N most recently created TowTrucks (published drivers) and the N
# most recently created RegistrationRequests (the pending review queue),
# together with everything a reader of either needs to render correctly —
# their photos and their privacy-consent row. Real data, not fabricated
# fixtures, which is the whole point: it exercises the admin panel's consent
# badges and the drivers CSV export against rows that actually look like
# what production has.
#
# Usage (run as the user that runs `pm2`/`npm` on this VPS):
#
#   scripts/seed-staging-sample.sh          # defaults to 20 of each
#   scripts/seed-staging-sample.sh 50       # or name a different count
#
# Environment (all optional):
#   PROD_ENV_FILE      backend/.env to read PRODUCTION's DATABASE_URL from
#                       (default /var/www/evakuators/backend/.env)
#   STAGING_ENV_FILE    backend/.env to read STAGING's DATABASE_URL from
#                       (default: this script's own checkout's backend/.env)
#   YES                 set to "1" to skip the interactive confirmation
#                       prompt (for scripted use)
#
# ── What this does, in order ─────────────────────────────────────────────
#   1. Read the two DATABASE_URLs and refuse to continue if they resolve to
#      the same database, or if the "staging" one doesn't look like staging
#      — same two guards refresh-staging-db.sh uses, same reason.
#   2. Ask production (READ ONLY — nothing here ever writes to it) which
#      TowTruck/RegistrationRequest ids are the N most recent.
#   3. Export just those rows, plus their TowTruckImage and
#      DriverPrivacyConsent rows, to CSV files.
#   4. In staging: delete any existing rows sharing those same ids (typical
#      — staging usually started as a full copy of production, so most
#      sampled ids already exist there with whatever staging-side edits a
#      tester made; those edits are overwritten by production's current
#      values, which is the point), then load the fresh CSVs.
#   5. Resync the four affected tables' id sequences, so the next row
#      staging creates on its own (a test registration submitted through
#      the UI, say) doesn't collide with an id this script just inserted
#      explicitly.
#
# No downtime: unlike refresh-staging-db.sh this never drops a database or
# stops staging's backend — it's ordinary DELETE/INSERT traffic on a handful
# of rows, and Postgres serves it to already-connected clients immediately.
#
# ── What this deliberately does NOT copy ─────────────────────────────────
#   - Review, ProfileChangeRequest, FreeRoute — not needed to see a driver's
#     profile and consent state, which is what this exists to let you test.
#   - AnalyticsDailyStat / AnalyticsVisitorDay — a freshly-sampled driver's
#     traffic totals (and their row in the admin CSV export) will read 0.
#     Known limitation, not a bug; extend the TABLE list below if a test
#     needs real numbers there too.
#   - Supabase Storage: nothing to do — copied rows keep pointing at
#     production's real, public, read-only image URLs (see
#     SUPABASE_STORAGE_READ_ONLY in docs/deployment.md).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_ENV_FILE="${PROD_ENV_FILE:-/var/www/evakuators/backend/.env}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-$REPO_ROOT/backend/.env}"
SAMPLE_SIZE="${1:-20}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# Never print a connection string with its password in it.
mask_url() { echo "$1" | sed -E 's#(://[^:]+:)[^@]+(@)#\1***\2#'; }

# Same plain string match as refresh-staging-db.sh — a full URI parser is
# more than a `postgresql://user:pass@host:port/dbname` string needs here.
db_name_of() { echo "$1" | sed -E 's#^[a-zA-Z0-9+]+://[^/]+/([^?]+).*#\1#'; }

# `?schema=public` is Prisma's own connection-string extension, not a real
# libpq URI parameter — psql rejects it outright, same as pg_dump does.
strip_query() { echo "$1" | sed -E 's/\?.*$//'; }

read_database_url() {
  local file="$1" label="$2"
  [[ -f "$file" ]] || fail "$label env file not found: $file"
  local value
  value="$(grep -E '^DATABASE_URL=' "$file" | tail -n1 | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')"
  [[ -n "$value" ]] || fail "$label env file has no DATABASE_URL: $file"
  echo "$value"
}

command -v psql >/dev/null || fail "psql not found (apt install postgresql-client)"
[[ "$SAMPLE_SIZE" =~ ^[0-9]+$ && "$SAMPLE_SIZE" -gt 0 ]] ||
  fail "sample size must be a positive integer, got: $SAMPLE_SIZE"

PROD_URL_RAW="$(read_database_url "$PROD_ENV_FILE" "production")"
STAGING_URL_RAW="$(read_database_url "$STAGING_ENV_FILE" "staging")"
PROD_DB="$(db_name_of "$PROD_URL_RAW")"
STAGING_DB="$(db_name_of "$STAGING_URL_RAW")"
PROD_URL="$(strip_query "$PROD_URL_RAW")"
STAGING_URL="$(strip_query "$STAGING_URL_RAW")"

# ── Safety checks — same two guards as refresh-staging-db.sh ────────────────

[[ -n "$PROD_DB" && -n "$STAGING_DB" ]] ||
  fail "could not parse a database name out of one of the DATABASE_URLs — aborting rather than guessing"

[[ "$PROD_DB" != "$STAGING_DB" ]] ||
  fail "production and staging DATABASE_URL resolve to the SAME database ($PROD_DB) — refusing to touch it"

case "$STAGING_DB" in
  *staging*) ;;
  *) fail "target database '$STAGING_DB' does not contain 'staging' in its name — refusing to write to it. Set STAGING_ENV_FILE to point at the right backend/.env if this is wrong." ;;
esac

log "production (read-only) : $(mask_url "$PROD_URL")"
log "staging (will be written): $(mask_url "$STAGING_URL")"
log "sample size: $SAMPLE_SIZE most recent TowTrucks + $SAMPLE_SIZE most recent RegistrationRequests"

if [[ "${YES:-}" != "1" ]]; then
  echo
  echo "This deletes and re-copies the sampled rows — and their photos and"
  echo "privacy-consent records — IN STAGING ONLY. Production is only ever read."
  read -r -p "Type SEED STAGING to continue: " CONFIRM
  [[ "$CONFIRM" == "SEED STAGING" ]] || fail "confirmation text did not match — aborting, nothing was touched"
fi

WORKDIR="$(mktemp -d /tmp/evakuators-staging-sample.XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

# ── 1. Which rows, from production ──────────────────────────────────────────

log "reading ids of the $SAMPLE_SIZE most recent rows from production"
TOWTRUCK_IDS_CSV="$(psql "$PROD_URL" -Atc \
  "SELECT string_agg(id::text, ',') FROM (SELECT id FROM \"TowTruck\" ORDER BY id DESC LIMIT $SAMPLE_SIZE) s;")"
REGISTRATION_IDS_CSV="$(psql "$PROD_URL" -Atc \
  "SELECT string_agg(id::text, ',') FROM (SELECT id FROM \"RegistrationRequest\" ORDER BY id DESC LIMIT $SAMPLE_SIZE) s;")"

[[ -n "$TOWTRUCK_IDS_CSV" ]] || log "WARNING: production has no TowTrucks at all — nothing to sample there"
[[ -n "$REGISTRATION_IDS_CSV" ]] || log "WARNING: production has no RegistrationRequests at all — nothing to sample there"

# Postgres array literal syntax — `= ANY('{1,2,3}'::int[])` — works even when
# the list is empty (`'{}'::int[]` matches nothing, rather than erroring).
TOWTRUCK_IDS_ARR="{${TOWTRUCK_IDS_CSV:-}}"
REGISTRATION_IDS_ARR="{${REGISTRATION_IDS_CSV:-}}"

# ── 2. Column lists ──────────────────────────────────────────────────────
#
# Explicit on purpose, never `SELECT *`: TowTruck.location is `GENERATED
# ALWAYS ... STORED` from latitude/longitude (see schema.prisma) and Postgres
# rejects an explicit value for a generated column outright, so it must be
# left out of both the export and the load. Everything below mirrors
# schema.prisma's own column order for that model.

TOWTRUCK_COLS='id, slug, "driverName", "companyName", phone, "secondaryPhone", whatsapp, telegram, email, "works24Hours", "workingHoursText", description, "vehicleBrand", "vehicleModel", "vehicleYear", "vehicleType", "capacityTons", "platformLengthM", "platformWidthM", "craneCapacityTons", "craneReachM", "maxLoadTons", "platformLoadHeightCm", winch, manipulator, "wheelSkates", "heavyEquipment", "plateNumber", "showPlateNumber", "regionSlug", "citySlug", "districtSlug", "locationName", "servesAllArmenia", latitude, longitude, "locationUpdatedAt", services, "serviceAreas", "priceCityCallout", "pricePerKm", "priceWaitingPerHour", "priceNightSurchargePercent", "priceExtraLoading", "isActive", "isFeatured", "createdAt", "updatedAt", "passwordHash", "mustChangePassword", "telegramChatId", "telegramLinkToken", "telegramLinkTokenExpiresAt", "contactNoticeIntroAt"'

REGISTRATION_COLS='id, status, "firstName", "lastName", "companyName", phone, "secondaryPhone", whatsapp, telegram, email, "vehicleBrand", "vehicleModel", "vehicleYear", "vehicleType", "capacityRange", "platformLengthM", "platformWidthM", "craneCapacityTons", "craneReachM", "maxLoadTons", "platformLoadHeightCm", winch, manipulator, "wheelSkates", "heavyEquipment", "servesAllArmenia", "workingHoursText", "regionSlugs", "citySlugs", services, latitude, longitude, "priceCityCallout", "pricePerKm", "priceWaitingPerHour", "priceNightSurchargePercent", "priceExtraLoading", "createdAt", "updatedAt"'

IMAGE_LOAD_COLS='id, path, url, width, height, "sizeBytes", position, "createdAt", "towTruckId", "registrationRequestId", "profileChangeRequestId"'
# The export SELECT hardcodes NULL for profileChangeRequestId (see below):
# ProfileChangeRequest rows are not part of this sample, and a copied image
# whose value still pointed at a real production id would fail staging's
# foreign key the moment it landed.

CONSENT_COLS='id, "towTruckId", "registrationRequestId", "policyVersion", "consentTextHash", "acceptedAt", "revokedAt", "ipHash", "userAgent", source, "createdAt"'

# ── 3. Export from production ───────────────────────────────────────────────

log "exporting the sampled rows"
psql "$PROD_URL" -c "\copy (SELECT $TOWTRUCK_COLS FROM \"TowTruck\" WHERE id = ANY('$TOWTRUCK_IDS_ARR'::int[])) TO '$WORKDIR/towtruck.csv' WITH (FORMAT csv)"
psql "$PROD_URL" -c "\copy (SELECT $REGISTRATION_COLS FROM \"RegistrationRequest\" WHERE id = ANY('$REGISTRATION_IDS_ARR'::int[])) TO '$WORKDIR/registration.csv' WITH (FORMAT csv)"
psql "$PROD_URL" -c "\copy (SELECT id, path, url, width, height, \"sizeBytes\", position, \"createdAt\", \"towTruckId\", \"registrationRequestId\", NULL::integer AS \"profileChangeRequestId\" FROM \"TowTruckImage\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[])) TO '$WORKDIR/image.csv' WITH (FORMAT csv)"
psql "$PROD_URL" -c "\copy (SELECT $CONSENT_COLS FROM \"DriverPrivacyConsent\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[])) TO '$WORKDIR/consent.csv' WITH (FORMAT csv)"

log "exported: $(wc -l < "$WORKDIR/towtruck.csv") tow trucks, $(wc -l < "$WORKDIR/registration.csv") registration requests, $(wc -l < "$WORKDIR/image.csv") images, $(wc -l < "$WORKDIR/consent.csv") consent records"

# ── 4. Clear + load into staging ────────────────────────────────────────────
#
# Children before parents, so nothing here relies on ON DELETE CASCADE/SetNull
# timing to be correct on its own — every row this script is about to insert
# is deleted explicitly first, by exactly the same id it's about to reuse.

log "clearing any earlier copies of these ids in staging"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 <<SQL
DELETE FROM "DriverPrivacyConsent" WHERE "towTruckId" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR "registrationRequestId" = ANY('$REGISTRATION_IDS_ARR'::int[]);
DELETE FROM "TowTruckImage" WHERE "towTruckId" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR "registrationRequestId" = ANY('$REGISTRATION_IDS_ARR'::int[]);
DELETE FROM "TowTruck" WHERE id = ANY('$TOWTRUCK_IDS_ARR'::int[]);
DELETE FROM "RegistrationRequest" WHERE id = ANY('$REGISTRATION_IDS_ARR'::int[]);
SQL

log "loading production's rows into staging"
psql "$STAGING_URL" -c "\copy \"TowTruck\" ($TOWTRUCK_COLS) FROM '$WORKDIR/towtruck.csv' WITH (FORMAT csv)"
psql "$STAGING_URL" -c "\copy \"RegistrationRequest\" ($REGISTRATION_COLS) FROM '$WORKDIR/registration.csv' WITH (FORMAT csv)"
psql "$STAGING_URL" -c "\copy \"TowTruckImage\" ($IMAGE_LOAD_COLS) FROM '$WORKDIR/image.csv' WITH (FORMAT csv)"
psql "$STAGING_URL" -c "\copy \"DriverPrivacyConsent\" ($CONSENT_COLS) FROM '$WORKDIR/consent.csv' WITH (FORMAT csv)"

# ── 5. Resync sequences ──────────────────────────────────────────────────
#
# COPY preserves the exact `id` values from production, which does NOT
# advance staging's own SERIAL sequence for that table. Left alone, the next
# ordinary insert (a driver registering through staging's own UI, say) could
# ask the sequence for an id lower than one this script just used explicitly
# — a unique-constraint violation that looks like a bug in the app, not in
# this script. `GREATEST(..., 1)` is for the empty-table edge case, where
# MAX(id) is NULL and setval would otherwise fail outright.
log "resyncing id sequences"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT setval(pg_get_serial_sequence('"TowTruck"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "TowTruck"), 1));
SELECT setval(pg_get_serial_sequence('"RegistrationRequest"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "RegistrationRequest"), 1));
SELECT setval(pg_get_serial_sequence('"TowTruckImage"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "TowTruckImage"), 1));
SELECT setval(pg_get_serial_sequence('"DriverPrivacyConsent"', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "DriverPrivacyConsent"), 1));
SQL

log "done — staging now has $SAMPLE_SIZE real tow trucks and $SAMPLE_SIZE real"
log "registration requests copied from production, with their photos and"
log "consent records. No restart needed — nothing here touched a schema or a"
log "running process, just rows."
