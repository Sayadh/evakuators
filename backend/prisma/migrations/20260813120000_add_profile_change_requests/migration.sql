-- Driver profile edits go through moderation.
--
-- See ProfileChangeRequest in schema.prisma for why the diff is stored as JSON
-- rather than as columns, and why a pending request is limited to one per truck.

CREATE TYPE "ProfileChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ProfileChangeRequest" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "status" "ProfileChangeStatus" NOT NULL DEFAULT 'PENDING',
    "changes" JSONB NOT NULL,
    "before" JSONB NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileChangeRequest_towTruckId_idx" ON "ProfileChangeRequest"("towTruckId");
CREATE INDEX "ProfileChangeRequest_status_createdAt_idx" ON "ProfileChangeRequest"("status", "createdAt");

ALTER TABLE "ProfileChangeRequest"
    ADD CONSTRAINT "ProfileChangeRequest_towTruckId_fkey"
    FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one PENDING request per truck.
--
-- A partial unique index rather than a plain one, because APPROVED and REJECTED
-- rows accumulate as history and must be allowed to repeat. Prisma cannot
-- express this in the schema, so it is written by hand here and the service
-- checks first for a friendly message — the index is what makes it true under a
-- double submit, where a check-then-write has a race window.
--
-- Two queued edits to one profile could not be applied in a defined order: the
-- second would silently overwrite whichever fields the first also touched, and
-- a moderator approving both in the order they appear would produce a profile
-- neither of them describes.
CREATE UNIQUE INDEX "ProfileChangeRequest_one_pending_per_truck"
    ON "ProfileChangeRequest"("towTruckId")
    WHERE "status" = 'PENDING';

-- A third owner for an image, alongside towTruckId and registrationRequestId.
--
-- Without it the nightly orphan purge (ImagesService, 24h TTL) would delete the
-- photos of a change request that had been waiting longer than a day, and
-- approving it would then fail on images that no longer exist.
ALTER TABLE "TowTruckImage" ADD COLUMN "profileChangeRequestId" INTEGER;

CREATE INDEX "TowTruckImage_profileChangeRequestId_idx"
    ON "TowTruckImage"("profileChangeRequestId");

ALTER TABLE "TowTruckImage"
    ADD CONSTRAINT "TowTruckImage_profileChangeRequestId_fkey"
    FOREIGN KEY ("profileChangeRequestId") REFERENCES "ProfileChangeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
