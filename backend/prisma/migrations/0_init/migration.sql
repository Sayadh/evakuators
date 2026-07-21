-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN');

-- CreateTable
CREATE TABLE "TowTruck" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "email" TEXT,
    "works24Hours" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "vehicleBrand" TEXT NOT NULL,
    "vehicleModel" TEXT,
    "vehicleYear" INTEGER NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "capacityTons" DOUBLE PRECISION NOT NULL,
    "platformLengthM" DOUBLE PRECISION,
    "platformWidthM" DOUBLE PRECISION,
    "winch" BOOLEAN NOT NULL DEFAULT true,
    "manipulator" BOOLEAN NOT NULL DEFAULT false,
    "plateNumber" TEXT,
    "showPlateNumber" BOOLEAN NOT NULL DEFAULT false,
    "regionSlug" TEXT,
    "citySlug" TEXT,
    "districtSlug" TEXT,
    "locationName" TEXT NOT NULL,
    "services" TEXT[],
    "serviceAreas" JSONB NOT NULL,
    "priceCityCallout" INTEGER,
    "pricePerKm" INTEGER,
    "priceWaitingPerHour" INTEGER,
    "priceNightSurchargePercent" INTEGER,
    "priceExtraLoading" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TowTruck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TowTruckImage" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "towTruckId" INTEGER,
    "registrationRequestId" INTEGER,

    CONSTRAINT "TowTruckImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "cityName" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationRequest" (
    "id" SERIAL NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "companyName" TEXT,
    "phone" TEXT NOT NULL,
    "secondaryPhone" TEXT,
    "whatsapp" TEXT,
    "telegram" TEXT,
    "email" TEXT,
    "vehicleBrand" TEXT NOT NULL,
    "vehicleModel" TEXT,
    "vehicleYear" INTEGER NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "capacityRange" TEXT,
    "platformDimensions" TEXT,
    "winch" BOOLEAN NOT NULL DEFAULT false,
    "manipulator" BOOLEAN NOT NULL DEFAULT false,
    "works24Hours" BOOLEAN NOT NULL DEFAULT false,
    "mainRegionSlug" TEXT NOT NULL,
    "citySlugs" TEXT[],
    "services" TEXT[],
    "priceCityCallout" INTEGER,
    "pricePerKm" INTEGER,
    "priceWaitingPerHour" INTEGER,
    "priceNightSurchargePercent" INTEGER,
    "priceExtraLoading" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TowTruck_slug_key" ON "TowTruck"("slug");

-- CreateIndex
CREATE INDEX "TowTruck_citySlug_idx" ON "TowTruck"("citySlug");

-- CreateIndex
CREATE INDEX "TowTruck_districtSlug_idx" ON "TowTruck"("districtSlug");

-- CreateIndex
CREATE INDEX "TowTruck_regionSlug_idx" ON "TowTruck"("regionSlug");

-- CreateIndex
CREATE INDEX "TowTruck_isActive_idx" ON "TowTruck"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TowTruckImage_path_key" ON "TowTruckImage"("path");

-- CreateIndex
CREATE INDEX "TowTruckImage_towTruckId_idx" ON "TowTruckImage"("towTruckId");

-- CreateIndex
CREATE INDEX "TowTruckImage_registrationRequestId_idx" ON "TowTruckImage"("registrationRequestId");

-- CreateIndex
CREATE INDEX "Review_towTruckId_idx" ON "Review"("towTruckId");

-- CreateIndex
CREATE INDEX "RegistrationRequest_status_idx" ON "RegistrationRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "TowTruckImage" ADD CONSTRAINT "TowTruckImage_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TowTruckImage" ADD CONSTRAINT "TowTruckImage_registrationRequestId_fkey" FOREIGN KEY ("registrationRequestId") REFERENCES "RegistrationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

