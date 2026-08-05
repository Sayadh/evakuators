#!/usr/bin/env bash
#
# Evakuators.am — refresh staging's database from a fresh production dump.
#
# Requirement this exists for (see docs/deployment.md § "Staging
# environment"): staging must be re-syncable to production's current data on
# demand, without ANY risk to production. "On demand" + "drops a database" is
# exactly the shape of command that is dangerous to run twice with the wrong
# arguments at 2am, so most of this script is safety checks, not the copy
# itself.
#
# What it does, in order:
#   1. pg_dump production (READ ONLY — production is never written to)
#   2. stop staging's backend, so nothing holds an open connection to the
#      database this script is about to drop
#   3. drop + recreate evakuators_staging, restore the dump into it
#   4. restart staging's backend
#
# Run as root (same user that runs `pm2` on this VPS) — the script itself
# switches to the `postgres` OS user internally for every Postgres command,
# the same pattern as the one-time setup in docs/deployment.md:
#
#   scripts/refresh-staging-db.sh
#
# Environment (all optional):
#   PROD_ENV_FILE      backend/.env to read PRODUCTION's DATABASE_URL from
#                       (default /var/www/evakuators/backend/.env)
#   STAGING_ENV_FILE    backend/.env to read STAGING's DATABASE_URL from
#                       (default: this script's own checkout's backend/.env)
#   STAGING_PM2_APP     PM2 process name to stop/restart around the restore
#                       (default evakuators-backend-staging)
#   YES                 set to "1" to skip the interactive confirmation
#                       prompt (for scripted use — there is no cron use case
#                       for this script today, this is for a future one)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_ENV_FILE="${PROD_ENV_FILE:-/var/www/evakuators/backend/.env}"
STAGING_ENV_FILE="${STAGING_ENV_FILE:-$REPO_ROOT/backend/.env}"
STAGING_PM2_APP="${STAGING_PM2_APP:-evakuators-backend-staging}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# Never print a connection string with its password in it.
mask_url() { echo "$1" | sed -E 's#(://[^:]+:)[^@]+(@)#\1***\2#'; }

# Postgres URLs put the database name as the last path segment, before any
# ?query string — this is deliberately a plain string match, not a full URL
# parser, because that is all a `postgresql://user:pass@host:port/dbname`
# string needs here.
db_name_of() { echo "$1" | sed -E 's#^[a-zA-Z0-9+]+://[^/]+/([^?]+).*#\1#'; }

# `?schema=public` is Prisma's own connection-string extension (it sets
# search_path), not a real libpq URI parameter — pg_dump/psql/pg_restore all
# reject it outright with "invalid URI query parameter: schema". Dropping the
# whole query string is safe here: this project uses exactly one schema
# ("public", enforced elsewhere), and pg_dump with no --schema flag already
# dumps every schema in the database regardless.
strip_query() { echo "$1" | sed -E 's/\?.*$//'; }

read_database_url() {
  local file="$1" label="$2"
  [[ -f "$file" ]] || fail "$label env file not found: $file"
  local value
  value="$(grep -E '^DATABASE_URL=' "$file" | tail -n1 | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')"
  [[ -n "$value" ]] || fail "$label env file has no DATABASE_URL: $file"
  echo "$value"
}

command -v pg_dump >/dev/null || fail "pg_dump not found (apt install postgresql-client)"
command -v pg_restore >/dev/null || fail "pg_restore not found (apt install postgresql-client)"

PROD_URL="$(read_database_url "$PROD_ENV_FILE" "production")"
STAGING_URL="$(read_database_url "$STAGING_ENV_FILE" "staging")"
PROD_DB="$(db_name_of "$PROD_URL")"
STAGING_DB="$(db_name_of "$STAGING_URL")"

# ── Safety checks — every one of these must pass before anything destructive
#    happens. Each guards a different way this could go wrong. ─────────────

[[ -n "$PROD_DB" && -n "$STAGING_DB" ]] ||
  fail "could not parse a database name out of one of the DATABASE_URLs — aborting rather than guessing"

# The single most important line in this file: if the two URLs ever resolve
# to the same database — a misconfigured STAGING_ENV_FILE, a copy/paste
# mistake, a symlink pointing the "staging" checkout at the production
# checkout — this refuses rather than dropping and restoring PRODUCTION.
[[ "$PROD_DB" != "$STAGING_DB" ]] ||
  fail "production and staging DATABASE_URL resolve to the SAME database ($PROD_DB) — refusing to touch it"

# Belt-and-suspenders on top of the check above: the target database's name
# must literally contain "staging", by convention (evakuators_staging). A
# database that doesn't match this is refused even if it genuinely differs
# from production's — better to fail loudly on an unexpected name than to
# drop the wrong thing because some other check had a gap.
case "$STAGING_DB" in
  *staging*) ;;
  *) fail "target database '$STAGING_DB' does not contain 'staging' in its name — refusing to drop it. Set STAGING_ENV_FILE to point at the right backend/.env if this is wrong." ;;
esac

log "production : $(mask_url "$PROD_URL")"
log "staging    : $(mask_url "$STAGING_URL")"
log "staging backend PM2 process: $STAGING_PM2_APP"

if [[ "${YES:-}" != "1" ]]; then
  echo
  echo "This will PERMANENTLY REPLACE every row in '$STAGING_DB' with a fresh copy"
  echo "of '$PROD_DB'. Production is only ever read from — nothing above writes to it."
  read -r -p "Type REFRESH STAGING to continue: " CONFIRM
  [[ "$CONFIRM" == "REFRESH STAGING" ]] || fail "confirmation text did not match — aborting, nothing was touched"
fi

DUMP_FILE="$(mktemp /tmp/evakuators-staging-refresh.XXXXXX.dump)"
cleanup() { rm -f "$DUMP_FILE"; }
trap cleanup EXIT

log "dumping production ($PROD_DB) — read-only, custom format"
pg_dump --no-owner --no-privileges -Fc "$(strip_query "$PROD_URL")" -f "$DUMP_FILE"
log "dump written: $(du -h "$DUMP_FILE" | cut -f1)"

# This script runs as root (see the file header), so the dump above is
# root-owned at mktemp's default 600 — unreadable by the `postgres` OS user
# that pg_restore runs as below. Widening to 644 is fine for the few seconds
# this file exists: it's under /tmp, deleted by the `cleanup` trap the moment
# this script exits (success OR failure), and this VPS's trust model is
# already "root is the only real operator" everywhere else in this project's
# deploy tooling.
chmod 644 "$DUMP_FILE"

log "stopping $STAGING_PM2_APP so nothing holds a connection to $STAGING_DB"
pm2 stop "$STAGING_PM2_APP" >/dev/null || log "WARNING: pm2 stop failed or the process wasn't running — continuing"

log "dropping and recreating $STAGING_DB (owner: evakuators)"
sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$STAGING_DB' AND pid <> pg_backend_pid();" >/dev/null
sudo -u postgres dropdb --if-exists "$STAGING_DB"
sudo -u postgres createdb "$STAGING_DB" -O evakuators

log "restoring into $STAGING_DB"
sudo -u postgres pg_restore --no-owner --no-privileges -d "$STAGING_DB" "$DUMP_FILE"

# pg_restore above runs AS the postgres OS user (peer auth -> postgres role),
# and --no-owner/--no-privileges deliberately strip the dump's own owner/GRANT
# statements (see the "Database: copy, not connection" note in
# docs/deployment.md for why: we don't want to import PRODUCTION's exact
# role/ownership setup wholesale). Net effect: every restored table/sequence
# ends up owned by the `postgres` role, with no privileges granted to
# `evakuators` — the role staging's DATABASE_URL actually connects as. Without
# this step every query fails with Postgres error 42501 "permission denied
# for table X", even though the data restored successfully.
log "granting evakuators full privileges on the restored schema"
sudo -u postgres psql -d "$STAGING_DB" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO evakuators; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO evakuators; GRANT USAGE, CREATE ON SCHEMA public TO evakuators;" >/dev/null

# ── Ownership, which is NOT the same thing as the privileges above ──────────
#
# `GRANT ALL PRIVILEGES` covers DML — SELECT, INSERT, UPDATE, DELETE — and that
# is what makes staging's backend able to serve pages after a refresh. It does
# NOT cover DDL: PostgreSQL requires you to *own* a table to ALTER it, and no
# GRANT can confer that.
#
# So without this block every refresh leaves a database that reads and writes
# perfectly and then fails the next `prisma migrate deploy` with
#   ERROR: must be owner of table TowTruck   (SQLSTATE 42501)
# — which is exactly what happened the first time a migration was deployed to
# staging after a refresh, and looked like a broken migration rather than a
# broken restore.
#
# Enums are included because a future migration may ALTER TYPE to add a value,
# and that hits the identical wall. The schema itself is transferred so
# CREATE TABLE keeps working for a brand-new model.
#
# REASSIGN OWNED BY postgres is deliberately NOT used: postgres also owns system
# catalog objects, and pointing a blanket reassignment at a superuser role is a
# much bigger hammer than "the things pg_restore just created in public".
# The schema itself is NOT reassigned — `GRANT USAGE, CREATE` above is already
# what a future `CREATE TABLE` needs, and owning `public` is a bigger change
# than this problem calls for.
#
# `deptype = 'e'` is the important filter: PostGIS installs `spatial_ref_sys`
# (and its own types) into `public`, and those are extension members that must
# stay owned by postgres. A naive loop over `pg_tables WHERE schemaname =
# 'public'` would try to reassign them too. Filtering on pg_depend is what makes
# this "the things pg_restore created", not "everything in public".
#
# REASSIGN OWNED BY postgres is deliberately not used either: postgres also owns
# system catalog objects, and pointing a blanket reassignment at a superuser role
# is a far bigger hammer than this needs.
log "transferring ownership of the restored objects to evakuators"
sudo -u postgres psql -d "$STAGING_DB" >/dev/null <<'SQL'
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

  -- Enums, so a future migration that ALTER TYPE ... ADD VALUE hits the same
  -- wall as ALTER TABLE would have.
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

log "starting $STAGING_PM2_APP"
pm2 start "$STAGING_PM2_APP" >/dev/null

log "done — staging now mirrors production as of this run. Restart the staging"
log "frontend too if you want its SSR cache/warm state reset: pm2 restart evakuators-frontend-staging"

# ── What this does NOT do ────────────────────────────────────────────────
#
# It does not touch Supabase Storage. Copied TowTruck/RegistrationRequest
# rows keep pointing at production's real, public, read-only image URLs —
# see SUPABASE_STORAGE_READ_ONLY in docs/deployment.md for why staging's own
# backend cannot write new ones there.
#
# It does not touch the Telegram webhook — no `setWebhook`/`deleteWebhook`
# call exists anywhere in this codebase; the webhook is a one-time manual
# `curl` documented in docs/deployment.md, run against production only.
