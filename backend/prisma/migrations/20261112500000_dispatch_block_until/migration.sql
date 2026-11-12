-- Blocking a driver (2026-11-12): the operator's dispatch pause now carries an
-- optional end. NULL = until an operator lifts it; a time = lifted by itself
-- then (read as "not blocked" from that moment — nothing has to run).
ALTER TABLE "DriverPresence" ADD COLUMN "dispatchSuspendedUntil" TIMESTAMPTZ(3);
