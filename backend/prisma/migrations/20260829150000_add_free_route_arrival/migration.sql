-- Estimated arrival — together with departureAt this is the range the public
-- card shows ("12:00-19:00"), and it now decides auto-expiry (see
-- FreeRoute.estimatedArrivalAt / FreeRoutesService). Nullable: a route posted
-- before this column existed has none, and both cron queries fall back to
-- departureAt for exactly that case.
ALTER TABLE "FreeRoute" ADD COLUMN IF NOT EXISTS "estimatedArrivalAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "FreeRoute_status_estimatedArrivalAt_idx" ON "FreeRoute"("status", "estimatedArrivalAt");
