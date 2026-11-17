-- Problem alerts (2026-11-16): an Online driver whose connection or GPS is
-- gone gets a visible push saying so («GPS-ը անջատված է…», «Կապ չկա…») —
-- at once, then every 5 minutes, at most 3 times per problem
-- (PushService.alertProblemDrivers). The console shows when he was told.
-- Additive: no existing row changes meaning.
ALTER TABLE "DriverPresence" ADD COLUMN "problemAlertReason" TEXT;
ALTER TABLE "DriverPresence" ADD COLUMN "problemAlertCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DriverPresence" ADD COLUMN "problemAlertAt" TIMESTAMPTZ(3);
