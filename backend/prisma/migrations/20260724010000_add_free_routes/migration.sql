-- CreateEnum
CREATE TYPE "FreeRouteStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateTable
CREATE TABLE "FreeRoute" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "startRegionSlug" TEXT NOT NULL,
    "startCitySlug" TEXT NOT NULL,
    "endRegionSlug" TEXT NOT NULL,
    "endCitySlug" TEXT NOT NULL,
    "departureAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "status" "FreeRouteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeRoute_towTruckId_idx" ON "FreeRoute"("towTruckId");

-- CreateIndex
CREATE INDEX "FreeRoute_status_departureAt_idx" ON "FreeRoute"("status", "departureAt");

-- AddForeignKey
ALTER TABLE "FreeRoute" ADD CONSTRAINT "FreeRoute_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
