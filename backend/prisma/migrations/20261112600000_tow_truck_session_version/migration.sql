-- Website driver sessions (2026-11-12 security audit): every website token
-- carries the truck's session version; changing or resetting the password
-- bumps it, which invalidates every token issued before.
ALTER TABLE "TowTruck" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
