-- AlterTable
ALTER TABLE "TowTruck" ADD COLUMN     "telegramChatId" BIGINT,
ADD COLUMN     "telegramLinkToken" TEXT,
ADD COLUMN     "telegramLinkTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DriverOtp" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TowTruck_telegramChatId_key" ON "TowTruck"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "TowTruck_telegramLinkToken_key" ON "TowTruck"("telegramLinkToken");

-- CreateIndex
CREATE INDEX "DriverOtp_towTruckId_idx" ON "DriverOtp"("towTruckId");

-- AddForeignKey
ALTER TABLE "DriverOtp" ADD CONSTRAINT "DriverOtp_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
