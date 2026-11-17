-- One row per thing that must keep running (2026-11-17): the worker writes
-- 'worker' every 15 s, the backup script writes 'backup' after every
-- successful upload. The API process reads them and tells the operators on
-- Telegram when one goes quiet (notify/ops-watch.ts) — a process cannot
-- report its own death, so each is watched from the outside.
--
-- `alertedAt` is the watchdog's own state, kept here rather than in memory so
-- a restart of the watcher neither repeats a «down» message nor forgets one.
CREATE TABLE "SystemHeartbeat" (
  "name"      TEXT NOT NULL,
  "at"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "data"      JSONB NOT NULL DEFAULT '{}',
  "alertedAt" TIMESTAMPTZ(3),
  CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("name")
);
