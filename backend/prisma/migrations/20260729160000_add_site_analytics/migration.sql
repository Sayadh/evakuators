-- CreateEnum
CREATE TYPE "SiteEventType" AS ENUM ('SITE_VISIT', 'FREE_ROUTES_VIEW');

-- CreateTable: site-wide counters (admin panel). Same two-table shape as the
-- per-tow-truck pair, minus the truck — see schema.prisma for why these are
-- separate tables rather than a nullable towTruckId.
CREATE TABLE "SiteDailyStat" (
    "id" SERIAL NOT NULL,
    "statDate" DATE NOT NULL,
    "eventType" "SiteEventType" NOT NULL,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable: the per-visitor dedup ledger
CREATE TABLE "SiteVisitorDay" (
    "id" SERIAL NOT NULL,
    "statDate" DATE NOT NULL,
    "eventType" "SiteEventType" NOT NULL,
    "visitorKey" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteVisitorDay_pkey" PRIMARY KEY ("id")
);

-- The arbiter of the counter UPSERT, and the admin panel's read index
CREATE UNIQUE INDEX "SiteDailyStat_statDate_eventType_key" ON "SiteDailyStat"("statDate", "eventType");

-- visitorKey last, so COUNT(DISTINCT visitorKey) over a range is index-only
CREATE UNIQUE INDEX "SiteVisitorDay_statDate_eventType_visitorKey_key" ON "SiteVisitorDay"("statDate", "eventType", "visitorKey");

-- For the retention purge, which filters on statDate alone
CREATE INDEX "SiteVisitorDay_statDate_idx" ON "SiteVisitorDay"("statDate");
