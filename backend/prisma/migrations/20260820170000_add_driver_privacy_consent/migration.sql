-- Consent to the processing and publication of a driver's personal data.
--
-- See DriverPrivacyConsent in schema.prisma for the full reasoning: why this is
-- an append-only history rather than a boolean on TowTruck, why a row can be
-- owned by either a TowTruck or a RegistrationRequest, and why the IP is stored
-- as a keyed hash or not at all.
--
-- ## This migration deliberately backfills NOTHING
--
-- ~100 drivers were already published when consent started being asked for.
-- Not one of them gets a row here. Writing an `acceptedAt` for a driver who has
-- never seen the dialog would be fabricating precisely the evidence this table
-- exists to hold honestly — and it would silently satisfy the very check that
-- is supposed to put the dialog in front of them.
--
-- The consequence is intended and is the feature: an empty table means
-- `requiresPrivacyConsent` is true for every existing driver, so each is asked
-- on their next login and each row that appears afterwards is a real one.
--
-- Additive only. Nothing is dropped, nothing is rewritten, and re-running this
-- file changes nothing (every statement below is IF NOT EXISTS / guarded).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrivacyConsentSource') THEN
        CREATE TYPE "PrivacyConsentSource" AS ENUM ('REGISTRATION', 'EXISTING_DRIVER');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "DriverPrivacyConsent" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER,
    "registrationRequestId" INTEGER,
    "policyVersion" TEXT NOT NULL,
    -- 64 hex characters of sha256, fixed width — see the column comment in
    -- schema.prisma for why the hash is the SERVER's, never the client's.
    "consentTextHash" VARCHAR(64) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    -- HMAC-SHA256 of the client IP, hex. Never the address itself.
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "source" "PrivacyConsentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPrivacyConsent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DriverPrivacyConsent_towTruckId_policyVersion_idx"
    ON "DriverPrivacyConsent"("towTruckId", "policyVersion");

CREATE INDEX IF NOT EXISTS "DriverPrivacyConsent_registrationRequestId_idx"
    ON "DriverPrivacyConsent"("registrationRequestId");

-- Exactly one owner, enforced by the database rather than by whoever writes the
-- next INSERT.
--
-- Prisma cannot express this (it has no cross-column check constraints), so it
-- is written by hand. A row with neither owner is an orphan no query would ever
-- find; a row with both would count as consent for a truck AND for the request
-- that produced it, which is one act of consenting recorded twice.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DriverPrivacyConsent_exactly_one_owner'
    ) THEN
        ALTER TABLE "DriverPrivacyConsent"
            ADD CONSTRAINT "DriverPrivacyConsent_exactly_one_owner"
            CHECK (("towTruckId" IS NULL) <> ("registrationRequestId" IS NULL));
    END IF;
END
$$;

-- At most one LIVE consent per (truck, version).
--
-- A partial unique index, on the same pattern and for the same reason as
-- ProfileChangeRequest_one_pending_per_truck: the service checks first so it
-- can answer idempotently with a friendly result, but a check followed by a
-- write has a race window, and a double-tapped «Համաձայն եմ» button is the most
-- ordinary way in the world to hit it. Two identical acceptance rows would not
-- corrupt anything, but they would make the audit history say a driver
-- consented twice at the same instant, which is not what happened.
--
-- Partial on `revokedAt IS NULL`, so withdrawing and consenting again later
-- creates a legitimate second row: the withdrawn one no longer occupies the
-- slot, and both remain in the history where they belong.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'DriverPrivacyConsent_one_live_per_truck_version'
    ) THEN
        CREATE UNIQUE INDEX "DriverPrivacyConsent_one_live_per_truck_version"
            ON "DriverPrivacyConsent"("towTruckId", "policyVersion")
            WHERE "revokedAt" IS NULL AND "towTruckId" IS NOT NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DriverPrivacyConsent_towTruckId_fkey'
    ) THEN
        ALTER TABLE "DriverPrivacyConsent"
            ADD CONSTRAINT "DriverPrivacyConsent_towTruckId_fkey"
            FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DriverPrivacyConsent_registrationRequestId_fkey'
    ) THEN
        ALTER TABLE "DriverPrivacyConsent"
            ADD CONSTRAINT "DriverPrivacyConsent_registrationRequestId_fkey"
            FOREIGN KEY ("registrationRequestId") REFERENCES "RegistrationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
