-- One row per job the dispatcher handed to a driver.
--
-- ## Why this table has to exist before the dispatch screen is useful
--
-- The screen's whole value is the three numbers next to each driver — how many
-- jobs they have had, when the last one was, and whether they have had any at
-- all. Two of the four filters read from here too. Without it the list is just
-- the public search with a phone button on it.
--
-- It is also what makes the subscription defensible. When a driver asks "what
-- am I paying for", the answer has to be a number with dates behind it, not a
-- recollection. Nothing else in the system records that a call was passed on:
-- the dispatcher rings the driver from their own phone, and that leaves no
-- trace anywhere.
--
-- ## What a row is, and what it is NOT
--
-- A row means "I gave this job to this driver". It is written when the
-- dispatcher presses «Ուղղորդված է» — that is, AFTER a driver has agreed on the
-- phone, not when their number was dialled. Calls that went unanswered leave
-- nothing here on purpose: the count has to mean work offered, or it means
-- nothing.
--
-- It is deliberately not an order: no status, no completion, no price, no
-- customer. Those are things the platform does not witness and cannot verify,
-- and inventing fields for them would produce numbers nobody could stand
-- behind.
--
-- The location is stored as the slug AND the name it had at the time, because
-- the taxonomy is static TypeScript rather than a table — a renamed district
-- must not silently rewrite last year's history.
CREATE TABLE "DispatchReferral" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "locationSlug" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "locationType" TEXT NOT NULL,
    "adminUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchReferral_pkey" PRIMARY KEY ("id")
);

-- The dispatch screen's own query: per driver, how many and how recently.
CREATE INDEX "DispatchReferral_towTruckId_createdAt_idx"
    ON "DispatchReferral"("towTruckId", "createdAt");

-- "Which places do the calls come from" — the question that tells the operator
-- where they are short of drivers.
CREATE INDEX "DispatchReferral_locationSlug_createdAt_idx"
    ON "DispatchReferral"("locationSlug", "createdAt");

-- Cascade: a deleted truck's referrals are meaningless, and the driver-facing
-- count is derived from them.
ALTER TABLE "DispatchReferral" ADD CONSTRAINT "DispatchReferral_towTruckId_fkey"
    FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
