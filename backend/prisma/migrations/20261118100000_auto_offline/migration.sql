-- Auto-Offline (2026-11-18, owner's decision): three offers IN A ROW that never
-- reached the driver's phone (expired with no delivery ack — phone off, flat,
-- or no internet) take him Offline, so the next orders stop waiting on a phone
-- that is not there. He comes back by opening the app and pressing Online,
-- which clears these columns. The admin sees why (FleetDriverView.autoOffline).
ALTER TABLE "DriverPresence" ADD COLUMN "autoOfflineAt" TIMESTAMPTZ(3);
ALTER TABLE "DriverPresence" ADD COLUMN "autoOfflineReason" TEXT;
