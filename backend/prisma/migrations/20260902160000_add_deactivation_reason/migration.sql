-- Why a driver was taken off the site — see DeactivationReason in
-- schema.prisma for why this is an enum of two and not a free-text note.
--
-- Nullable and additive, no backfill. Every currently deactivated driver reads
-- as "no reason recorded", which is exactly true: nothing ever asked. Login
-- treats that the same as OTHER (refuse, show the contact number), which is
-- the safe direction — we cannot tell after the fact whether someone was
-- banned or simply had not paid.

-- CreateEnum
CREATE TYPE "DeactivationReason" AS ENUM ('UNPAID', 'OTHER');

-- AlterTable
ALTER TABLE "TowTruck" ADD COLUMN IF NOT EXISTS "deactivationReason" "DeactivationReason";
