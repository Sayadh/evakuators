-- Waiting for a free driver (2026-11-16). When every matching driver is busy
-- with ANOTHER order's offer or job, the search no longer fails at once: it
-- waits (until its deadline) for one of them to be free. `waitingSince`
-- marks such an attempt — the console shows «սպասում է ազատ վարորդի», and
-- older waiting orders take a freed driver before newer ones (FIFO).
-- Additive.
ALTER TABLE "DispatchAttempt" ADD COLUMN "waitingSince" TIMESTAMPTZ(3);
CREATE INDEX "DispatchAttempt_waiting_idx" ON "DispatchAttempt" ("waitingSince") WHERE "endedAt" IS NULL AND "waitingSince" IS NOT NULL;
