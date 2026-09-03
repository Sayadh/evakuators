-- Driver-initiated subscription payments — see SubscriptionPayment in
-- schema.prisma for why the plans themselves are constants and not a table,
-- and why amount/currency/durationMonths are copied onto each row.
--
-- Additive and independent: nothing reads this table yet outside the driver's
-- own dashboard, and TowTruck.lastPaymentAt (the admin's manual bookkeeping)
-- is deliberately untouched.

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "planCode" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionPayment_towTruckId_createdAt_idx" ON "SubscriptionPayment"("towTruckId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
