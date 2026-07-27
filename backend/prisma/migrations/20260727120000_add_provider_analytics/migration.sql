-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'PHONE_CLICK', 'WHATSAPP_CLICK', 'TELEGRAM_CLICK', 'EMAIL_CLICK');

-- CreateTable
CREATE TABLE "AnalyticsDailyStat" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "statDate" DATE NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsVisitorDay" (
    "id" SERIAL NOT NULL,
    "towTruckId" INTEGER NOT NULL,
    "statDate" DATE NOT NULL,
    "eventType" "AnalyticsEventType" NOT NULL,
    "visitorKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsVisitorDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Conflict target for the aggregate UPSERT and, via its (towTruckId, statDate)
-- prefix, the only index the dashboard/chart reads need.
CREATE UNIQUE INDEX "AnalyticsDailyStat_towTruckId_statDate_eventType_key" ON "AnalyticsDailyStat"("towTruckId", "statDate", "eventType");

-- CreateIndex
-- Enforces the once-per-visitor-per-calendar-day rule in the database itself.
-- visitorKey is intentionally the LAST column so the same index answers
-- COUNT(DISTINCT "visitorKey") for a (towTruckId, date range, eventType) as an
-- index-only scan — that is the "unique visitors" dashboard metric.
CREATE UNIQUE INDEX "AnalyticsVisitorDay_towTruckId_statDate_eventType_visitorKe_key" ON "AnalyticsVisitorDay"("towTruckId", "statDate", "eventType", "visitorKey");

-- CreateIndex
-- Retention purge only: it filters on statDate across every tow truck and so
-- cannot use the towTruckId-leading unique index above.
CREATE INDEX "AnalyticsVisitorDay_statDate_idx" ON "AnalyticsVisitorDay"("statDate");

-- AddForeignKey
ALTER TABLE "AnalyticsDailyStat" ADD CONSTRAINT "AnalyticsDailyStat_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsVisitorDay" ADD CONSTRAINT "AnalyticsVisitorDay_towTruckId_fkey" FOREIGN KEY ("towTruckId") REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
