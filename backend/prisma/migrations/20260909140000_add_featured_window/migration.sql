-- A paid top placement now has a start and an end.
--
-- ## What changed, and what deliberately did not
--
-- `isFeatured` stays exactly what it was — the one boolean everything already
-- reads. These two columns describe the WINDOW it is true for, so no caller
-- that asks "is this driver featured" has to learn a new field name to keep
-- working.
--
-- `featuredAt` is when the placement was granted, and it is not decoration: it
-- is the ORDER. Several drivers in one town can hold a placement at once, and
-- the one granted most recently goes on top — so a driver who pays today is
-- visibly first tomorrow, and the person who paid a week ago moves down by one
-- rather than being displaced entirely.
--
-- `featuredUntil` is when it stops. NULL means "no end", which is what every
-- row that predates this migration has: those placements were granted by an
-- admin with no notion of a duration, and expiring them on deploy would
-- silently remove editorial picks nobody asked to remove. New grants always
-- carry a date — the admin dialog requires 1-30 days.
--
-- ## Why the expiry is enforced on READ and swept by a job, not only swept
--
-- The hourly job is cleanup, not correctness. Between two runs there is always
-- a window where `featuredUntil` has passed and `isFeatured` is still true, and
-- during it a driver would be occupying a paid slot they no longer paid for.
-- So every read applies the window itself (`isFeaturedNow`), and the job exists
-- to make the stored row agree with what is already being shown.
ALTER TABLE "TowTruck" ADD COLUMN "featuredAt" TIMESTAMP(3);
ALTER TABLE "TowTruck" ADD COLUMN "featuredUntil" TIMESTAMP(3);

-- The sweep's own query: the rows whose window has closed. Partial, because
-- featured drivers are a handful out of the whole table and the index has no
-- reason to carry the rest.
CREATE INDEX "TowTruck_featuredUntil_idx"
    ON "TowTruck"("featuredUntil")
    WHERE "isFeatured" = true;
