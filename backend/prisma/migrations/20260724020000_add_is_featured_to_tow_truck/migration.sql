-- AlterTable
ALTER TABLE "TowTruck" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TowTruck_isFeatured_idx" ON "TowTruck"("isFeatured");
