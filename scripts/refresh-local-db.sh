#!/usr/bin/env bash
#
# Evakuators.am — make your LOCAL database an exact copy of STAGING's.
#
# Run this on your own machine, not on the VPS.
#
# ## Why it copies staging and not production
#
# Staging is already a copy of production (see scripts/refresh-staging-db.sh),
# so copying staging gives you the same rows either way — and this script then
# never opens a connection to the production database at all. There is no
# sequence of flags, no misconfigured .env and no typo'd hostname that can turn
# "refresh my laptop" into anything production notices. That guarantee is worth
# more than the few hours of staleness between staging's last refresh and now;
# if you need production's newest data, refresh staging first, on the VPS.
#
# ## What "identical to staging" does and does not mean
#
#   Same:      every row, the schema, the PostGIS extension, the images
#              (they are absolute Supabase URLs, so they render from any host)
#   Different: ports (3002/4002 locally vs 3003/4003 on staging — both are
#              reserved, see CLAUDE.md), and DATABASE_URL, which necessarily
#              points at your own machine
#
# The Telegram *webhook* is the one thing that cannot be mirrored: a bot has
# exactly one webhook URL globally and it points at production, so account
# linking cannot be tested locally no matter how the environment is configured.
# See docs/local-development.md § "Telegram login/link flow".
#
# Usage:
#   scripts/refresh-local-db.sh
#
# Environment (all optional):
#   STAGING_SSH        user@host of the VPS         (default root@evakuators.am)
#   STAGING_ENV_FILE   staging's backend/.env ON THE VPS
#                       (default /var/www/evakuators-staging/backend/.env)
#   LOCAL_ENV_FILE     your local backend/.env      (default: this checkout's)
#   LOCAL_SUPERUSER    a local Postgres superuser role that can drop/create
#                       databases and CREATE EXTENSION  (default postgres)
#   YES                set to "1" to skip the confirmation prompt
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING_SSH="${STAGING_SSH:-root@evakuators.am}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-/var/www/evakuators-staging/backend/.env}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-$REPO_ROOT/backend/.env}"
LOCAL_SUPERUSER="${LOCAL_SUPERUSER:-postgres}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

mask_url() { echo "$1" | sed -E 's#(://[^:]+:)[^@]+(@)#\1***\2#'; }
db_name_of() { echo "$1" | sed -E 's#^[a-zA-Z0-9+]+://[^/]+/([^?]+).*#\1#'; }

# `?schema=public` is Prisma's own connection-string extension, not a libpq
# parameter — psql/pg_restore reject it outright. Same helper, same reason as
# refresh-staging-db.sh.
strip_query() { echo "$1" | sed -E 's/\?.*$//'; }

read_database_url_local() {
  [[ -f "$LOCAL_ENV_FILE" ]] || fail "local env file not found: $LOCAL_ENV_FILE"
  local value
  value="$(grep -E '^DATABASE_URL=' "$LOCAL_ENV_FILE" | tail -n1 | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')"
  [[ -n "$value" ]] || fail "local env file has no DATABASE_URL: $LOCAL_ENV_FILE"
  echo "$value"
}

command -v pg_restore >/dev/null || fail "pg_restore not found (brew install libpq, or postgresql-client)"
command -v psql >/dev/null || fail "psql not found"
command -v ssh >/dev/null || fail "ssh not found"

LOCAL_URL="$(read_database_url_local)"
LOCAL_DB="$(db_name_of "$LOCAL_URL")"
[[ -n "$LOCAL_DB" ]] || fail "could not parse a database name out of the local DATABASE_URL"

# ── Safety: this must not be able to target a remote database ───────────────
#
# The whole point of this script is that it only ever destroys something on your
# own machine. A DATABASE_URL pointing anywhere else — a copy-pasted staging or
# production string in your local .env, which is exactly the mistake that
# happens at 2am — must stop it, not merely be unusual.
LOCAL_HOST="$(echo "$LOCAL_URL" | sed -E 's#^[a-zA-Z0-9+]+://[^@]*@?([^:/]+).*#\1#')"
case "$LOCAL_HOST" in
  localhost|127.0.0.1|::1|'') ;;
  *) fail "local DATABASE_URL points at '$LOCAL_HOST', not localhost. Refusing to touch a remote database." ;;
esac

log "staging (source): $STAGING_SSH:$STAGING_ENV_FILE"
log "local  (target): $(mask_url "$LOCAL_URL")"

if [[ "${YES:-}" != "1" ]]; then
  printf 'This DROPS and recreates the local database "%s". Type REFRESH LOCAL to continue: ' "$LOCAL_DB"
  read -r answer
  [[ "$answer" == "REFRESH LOCAL" ]] || fail "cancelled"
fi

DUMP_FILE="$(mktemp -t evakuators-staging-dump)"
# The dump holds every driver's real phone number and Telegram chat id. 600 while
# it exists, and removed on any exit path including a failure — a forgotten
# world-readable copy of the production dataset in /tmp is the kind of thing
# nobody finds until it matters.
chmod 600 "$DUMP_FILE"
cleanup() { rm -f "$DUMP_FILE"; }
trap cleanup EXIT

# Dumped ON the VPS (where staging's .env and its Postgres both live) and
# streamed here over the SSH pipe, so nothing has to expose Postgres to the
# internet and no credential is passed on a command line.
log "dumping staging over ssh"
ssh "$STAGING_SSH" bash -s <<REMOTE > "$DUMP_FILE"
set -euo pipefail
url="\$(grep -E '^DATABASE_URL=' '$STAGING_ENV_FILE' | tail -n1 | sed -E 's/^DATABASE_URL="?([^"]*)"?\$/\1/')"
[[ -n "\$url" ]] || { echo 'staging .env has no DATABASE_URL' >&2; exit 1; }
url="\$(echo "\$url" | sed -E 's/\?.*\$//')"
pg_dump --format=custom --no-owner --no-privileges "\$url"
REMOTE

[[ -s "$DUMP_FILE" ]] || fail "the dump came back empty — check $STAGING_SSH and $STAGING_ENV_FILE"
log "dump received ($(du -h "$DUMP_FILE" | cut -f1))"

log "recreating local database $LOCAL_DB"
psql -U "$LOCAL_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$LOCAL_DB' AND pid <> pg_backend_pid();" >/dev/null
dropdb -U "$LOCAL_SUPERUSER" --if-exists "$LOCAL_DB"
createdb -U "$LOCAL_SUPERUSER" -O evakuators "$LOCAL_DB"

# Before the restore, not after: the dump contains a `geography` column, and
# restoring it into a database without PostGIS fails on the type itself.
log "ensuring PostGIS is installed"
psql -U "$LOCAL_SUPERUSER" -d "$LOCAL_DB" -v ON_ERROR_STOP=1 \
  -c 'CREATE EXTENSION IF NOT EXISTS postgis;' >/dev/null

log "restoring"
# --no-owner/--no-privileges for the same reason the staging script uses them:
# the dump's roles are the server's, not your laptop's. Ownership is fixed up
# below instead.
pg_restore -U "$LOCAL_SUPERUSER" --no-owner --no-privileges -d "$LOCAL_DB" "$DUMP_FILE"

# GRANT is not ownership: PostgreSQL requires you to OWN a table to ALTER it, so
# without this the first `prisma migrate dev` after a refresh fails with
#   ERROR: must be owner of table TowTruck   (SQLSTATE 42501)
# `deptype = 'e'` skips extension members — PostGIS puts `spatial_ref_sys` in
# public and it must stay owned by the superuser. Identical block to the one in
# refresh-staging-db.sh, and it exists here for the identical reason.
log "granting and transferring ownership to evakuators"
psql -U "$LOCAL_SUPERUSER" -d "$LOCAL_DB" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO evakuators;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO evakuators;
GRANT USAGE, CREATE ON SCHEMA public TO evakuators;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'S', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    IF r.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE public.%I OWNER TO evakuators', r.relname);
    ELSE
      EXECUTE format('ALTER TABLE public.%I OWNER TO evakuators', r.relname);
    END IF;
  END LOOP;

  FOR r IN
    SELECT t.oid, t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public'
       AND t.typtype = 'e'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO evakuators', r.typname);
  END LOOP;
END $$;
SQL

log "done — local now mirrors staging."
log ""
log "Next, if you have not already mirrored the environment itself:"
log "  1. copy backend/.env from staging, then change DATABASE_URL back to the"
log "     local one above, PORT to 4002, CORS_ORIGIN to http://localhost:3002"
log "     and FRONTEND_URL to http://localhost:3002"
log "  2. echo 'NUXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1' > frontend/.env"
log "  3. cd backend && npx prisma generate && npm run start:dev"
log ""
log "See docs/local-development.md § \"Mirroring staging locally\"."
