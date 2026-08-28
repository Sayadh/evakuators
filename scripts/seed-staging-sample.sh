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

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

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
# left out of both the export and the load regardless.
#
# The lists below are the DESIRED columns per schema.prisma, in its column
# order — but production and staging are not guaranteed to be on the same
# migration at the moment this runs (staging routinely gets a new migration
# before production does; that's the entire point of having a staging
# environment). `columns_present_in_both` below intersects this wishlist
# against what each database's information_schema actually reports right
# now, so a column added to the schema but not yet migrated onto production
# is silently skipped instead of failing the whole script.

# columns_present_in_both TABLE col1 col2 ... → prints a quoted, comma-joined
# list on stdout containing only the given columns that exist, right now, in
# BOTH databases — in the order they were listed here, not information_schema
# order.
columns_present_in_both() {
  local table="$1"; shift
  local prod_cols staging_cols col out=() missing=()
  prod_cols=" $(psql "$PROD_URL" -Atc "SELECT string_agg(column_name, ' ') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table';") "
  staging_cols=" $(psql "$STAGING_URL" -Atc "SELECT string_agg(column_name, ' ') FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$table';") "

  # A table missing entirely (not one column, but every column) means one side
  # hasn't run that model's migration at all. Report it as the one fact it is,
  # rather than as a wall of one-line-per-column notes.
  if [[ "$(echo "$prod_cols" | tr -d ' ')" == "" ]]; then
    log "  SKIPPING table \"$table\": it does not exist in PRODUCTION (that migration hasn't been applied there yet)"
    return 0
  fi
  if [[ "$(echo "$staging_cols" | tr -d ' ')" == "" ]]; then
    log "  SKIPPING table \"$table\": it does not exist in STAGING (run the migrations there first)"
    return 0
  fi

  for col in "$@"; do
    if [[ "$prod_cols" == *" $col "* && "$staging_cols" == *" $col "* ]]; then
      out+=("\"$col\"")
    else
      missing+=("$col")
    fi
  done
  [[ ${#missing[@]} -eq 0 ]] ||
    log "  note: \"$table\" — skipping ${#missing[@]} column(s) not present in both databases: ${missing[*]}"
  local IFS=,
  echo "${out[*]}"
}

log "checking which columns exist in both databases right now"

TOWTRUCK_COLS="$(columns_present_in_both TowTruck \
  id slug driverName companyName phone secondaryPhone whatsapp telegram email \
  works24Hours workingHoursText description vehicleBrand vehicleModel vehicleYear \
  vehicleType capacityTons platformLengthM platformWidthM craneCapacityTons \
  craneReachM maxLoadTons platformLoadHeightCm winch manipulator wheelSkates \
  doubleDeck heavyEquipment plateNumber showPlateNumber regionSlug citySlug districtSlug \
  locationName servesAllArmenia latitude longitude locationUpdatedAt services \
  serviceAreas priceCityCallout pricePerKm priceWaitingPerHour \
  priceNightSurchargePercent priceExtraLoading isActive isFeatured createdAt \
  updatedAt passwordHash mustChangePassword telegramChatId telegramLinkToken \
  telegramLinkTokenExpiresAt contactNoticeIntroAt)"

REGISTRATION_COLS="$(columns_present_in_both RegistrationRequest \
  id status firstName lastName companyName phone secondaryPhone whatsapp \
  telegram email vehicleBrand vehicleModel vehicleYear vehicleType capacityRange \
  platformLengthM platformWidthM craneCapacityTons craneReachM maxLoadTons \
  platformLoadHeightCm winch manipulator wheelSkates doubleDeck heavyEquipment \
  servesAllArmenia workingHoursText regionSlugs citySlugs services latitude \
  longitude priceCityCallout pricePerKm priceWaitingPerHour \
  priceNightSurchargePercent priceExtraLoading createdAt updatedAt)"

IMAGE_LOAD_COLS="$(columns_present_in_both TowTruckImage \
  id path url width height sizeBytes position createdAt towTruckId \
  registrationRequestId profileChangeRequestId)"
# profileChangeRequestId is nulled out at export time regardless (see below):
# ProfileChangeRequest rows are not part of this sample, and a copied image
# whose value still pointed at a real production id would fail staging's
# foreign key the moment it landed.

CONSENT_COLS="$(columns_present_in_both DriverPrivacyConsent \
  id towTruckId registrationRequestId policyVersion consentTextHash acceptedAt \
  revokedAt ipHash userAgent source createdAt)"

[[ -n "$TOWTRUCK_COLS" ]] || fail "no common TowTruck columns found — is STAGING_ENV_FILE/PROD_ENV_FILE pointing at the right databases?"
[[ -n "$REGISTRATION_COLS" ]] || fail "no common RegistrationRequest columns found — is STAGING_ENV_FILE/PROD_ENV_FILE pointing at the right databases?"

# Same column NAMES as IMAGE_LOAD_COLS, but the value read for
# profileChangeRequestId is forced to NULL rather than copied — see the note
# above where IMAGE_LOAD_COLS is built.
IMAGE_EXPORT_COLS="${IMAGE_LOAD_COLS//\"profileChangeRequestId\"/NULL::integer AS \"profileChangeRequestId\"}"

# ── 3. Export from production ───────────────────────────────────────────────
#
# Plain SQL `COPY ... TO STDOUT`, not the `\copy` meta-command: `\copy` is
# parsed by psql's own lightweight, line-oriented backslash-command scanner
# (not the real SQL parser), and that scanner chokes on a machine-built
# one-liner mixing quoted identifiers, string literals and `::int[]` casts
# ("\copy: parse error at end of line"). Routing the same query through the
# ordinary `COPY ... TO STDOUT` SQL statement inside `-c` sends it through
# the real parser instead, then the copy stream is just `-c`'s stdout,
# redirected to a file exactly like any other command's output.

log "exporting the sampled rows"

psql "$PROD_URL" -v ON_ERROR_STOP=1 -c "COPY (SELECT $TOWTRUCK_COLS FROM \"TowTruck\" WHERE id = ANY('$TOWTRUCK_IDS_ARR'::int[])) TO STDOUT WITH (FORMAT csv)" > "$WORKDIR/towtruck.csv"
psql "$PROD_URL" -v ON_ERROR_STOP=1 -c "COPY (SELECT $REGISTRATION_COLS FROM \"RegistrationRequest\" WHERE id = ANY('$REGISTRATION_IDS_ARR'::int[])) TO STDOUT WITH (FORMAT csv)" > "$WORKDIR/registration.csv"
log "exported: $(wc -l < "$WORKDIR/towtruck.csv") tow trucks, $(wc -l < "$WORKDIR/registration.csv") registration requests"

if [[ -n "$IMAGE_LOAD_COLS" ]]; then
  psql "$PROD_URL" -v ON_ERROR_STOP=1 -c "COPY (SELECT $IMAGE_EXPORT_COLS FROM \"TowTruckImage\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[])) TO STDOUT WITH (FORMAT csv)" > "$WORKDIR/image.csv"
  log "exported: $(wc -l < "$WORKDIR/image.csv") images"
fi

if [[ -n "$CONSENT_COLS" ]]; then
  psql "$PROD_URL" -v ON_ERROR_STOP=1 -c "COPY (SELECT $CONSENT_COLS FROM \"DriverPrivacyConsent\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[])) TO STDOUT WITH (FORMAT csv)" > "$WORKDIR/consent.csv"
  log "exported: $(wc -l < "$WORKDIR/consent.csv") consent records"
fi

# ── 4. Clear + load into staging ────────────────────────────────────────────
#
# Children before parents, so nothing here relies on ON DELETE CASCADE/SetNull
# timing to be correct on its own — every row this script is about to insert
# is deleted explicitly first, by exactly the same id it's about to reuse.

log "clearing any earlier copies of these ids in staging"

# One DELETE per table rather than one heredoc for all four, so a table that
# was skipped above (missing from production, so nothing to re-copy) doesn't
# take the whole statement batch down with it.
[[ -z "$CONSENT_COLS" ]] || psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM \"DriverPrivacyConsent\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[]);"
[[ -z "$IMAGE_LOAD_COLS" ]] || psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM \"TowTruckImage\" WHERE \"towTruckId\" = ANY('$TOWTRUCK_IDS_ARR'::int[]) OR \"registrationRequestId\" = ANY('$REGISTRATION_IDS_ARR'::int[]);"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM \"TowTruck\" WHERE id = ANY('$TOWTRUCK_IDS_ARR'::int[]);"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "DELETE FROM \"RegistrationRequest\" WHERE id = ANY('$REGISTRATION_IDS_ARR'::int[]);"

log "loading production's rows into staging"
# Same reasoning as the export step: `COPY ... FROM STDIN` through the real
# SQL parser, fed by redirecting the file onto `-c`'s stdin.
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "COPY \"TowTruck\" ($TOWTRUCK_COLS) FROM STDIN WITH (FORMAT csv)" < "$WORKDIR/towtruck.csv"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "COPY \"RegistrationRequest\" ($REGISTRATION_COLS) FROM STDIN WITH (FORMAT csv)" < "$WORKDIR/registration.csv"
[[ -z "$IMAGE_LOAD_COLS" ]] || psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "COPY \"TowTruckImage\" ($IMAGE_LOAD_COLS) FROM STDIN WITH (FORMAT csv)" < "$WORKDIR/image.csv"
[[ -z "$CONSENT_COLS" ]] || psql "$STAGING_URL" -v ON_ERROR_STOP=1 -c "COPY \"DriverPrivacyConsent\" ($CONSENT_COLS) FROM STDIN WITH (FORMAT csv)" < "$WORKDIR/consent.csv"

# ── 5. Resync sequences ──────────────────────────────────────────────────
#
# COPY preserves the exact `id` values from production, which does NOT
# advance staging's own SERIAL sequence for that table. Left alone, the next
# ordinary insert (a driver registering through staging's own UI, say) could
# ask the sequence for an id lower than one this script just used explicitly
# — a unique-constraint violation that looks like a bug in the app, not in
# this script. `GREATEST(..., 1)` is for the empty-table edge case, where
# MAX(id) is NULL and setval would otherwise fail outright.
#
# Only the tables actually written above; `to_regclass` returns NULL rather
# than erroring for a table that doesn't exist, so a staging database missing
# one of these is a no-op here instead of a failure.
log "resyncing id sequences"
psql "$STAGING_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['TowTruck', 'RegistrationRequest', 'TowTruckImage', 'DriverPrivacyConsent'] LOOP
    IF to_regclass(format('%I', t)) IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(pg_get_serial_sequence(%L, %L), GREATEST((SELECT COALESCE(MAX(id), 0) FROM %I), 1))',
        format('"%s"', t), 'id', t
      );
    END IF;
  END LOOP;
END $$;
SQL

log "done — staging now has up to $SAMPLE_SIZE real tow trucks and up to"
log "$SAMPLE_SIZE real registration requests copied from production, plus"
log "whatever related rows the tables above allowed. No restart needed —"
log "nothing here touched a schema or a running process, just rows."
