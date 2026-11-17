-- The operator's 1–5 rating of a completed job (2026-11-17), usually after
-- asking the customer. One per order, for the driver who completed it; the
-- operator may change it (updatedAt). Information only for now — it is shown
-- on the drivers page and the stats page, and does NOT affect dispatch.
CREATE TABLE "OrderRating" (
  "orderId"       INTEGER NOT NULL,
  "assignmentId"  INTEGER NOT NULL,
  "driverId"      INTEGER NOT NULL,
  "score"         SMALLINT NOT NULL,
  "comment"       TEXT,
  "ratedByUserId" INTEGER,
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "OrderRating_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "OrderRating_score_check" CHECK ("score" BETWEEN 1 AND 5),
  CONSTRAINT "OrderRating_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderRating_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "OrderAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderRating_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderRating_driver_idx" ON "OrderRating" ("driverId");
