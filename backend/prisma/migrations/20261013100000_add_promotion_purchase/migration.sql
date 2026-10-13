-- A driver can now buy their own placement at the top of their town's page,
-- and refresh it to climb back up. Two things that needs: somewhere to record
-- the money, and somewhere to count the refreshes.
--
-- ## Why the money goes in SubscriptionPayment rather than a table of its own
--
-- Because of Idram. `EDP_BILL_NO` IS our payment id, and `parseIdramBillNo`
-- accepts only a positive INT4 — deliberately, so a bill number that cannot be
-- one of our ids is refused before it reaches an INT4 column and throws from a
-- public endpoint. Two tables would be two id spaces and therefore colliding
-- bill numbers, and the fix for that is editing the bill-number format of a
-- working payment integration against a provider whose constraints we cannot
-- test here.
--
-- It is also the more honest shape: this table is the ledger of money received
-- from drivers, and WHAT was bought is a property of the payment.
--
-- ## The risk this creates, and the two things that bound it
--
-- Every existing query against this table means "subscription coverage". A
-- promotion row that leaked into one of them would hand a driver who paid 400 ֏
-- for one day of placement a day of free platform access.
--
--   1. Every one of those queries lives in `subscriptions.repository.ts` — all
--      eleven of them — and each now carries an explicit `kind` filter. A test
--      asserts that no query in that file reads the table without one.
--
--   2. `periodStart`/`periodEnd` stay NULL on a promotion row. Coverage is a
--      MAX over `periodEnd`, and SQL's MAX ignores NULLs — so even a query that
--      forgot its filter would read a promotion as granting nothing. That is
--      the point of leaving them empty rather than filling them with the
--      promotion's own window, which would have been informative and unsafe.
--
-- The CHECK constraint below is what keeps both halves true in the database
-- rather than only in the code that writes it.

CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'PROMOTION');

-- DEFAULT 'SUBSCRIPTION' is what backfills every existing row correctly: this
-- table has held nothing else, so the default IS the migration.
ALTER TABLE "SubscriptionPayment"
  ADD COLUMN "kind" "PaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN "promotionDays" INTEGER;

-- The four subscription-shaped columns become nullable, because a promotion
-- has no plan and no month count. Dropping NOT NULL never rewrites the table
-- and never fails on existing data.
ALTER TABLE "SubscriptionPayment"
  ALTER COLUMN "planCode" DROP NOT NULL,
  ALTER COLUMN "durationMonths" DROP NOT NULL,
  ALTER COLUMN "periodStart" DROP NOT NULL,
  ALTER COLUMN "periodEnd" DROP NOT NULL;

-- One row cannot be half a subscription and half a placement. Written as a
-- constraint rather than trusted to the service because this is the table that
-- answers "how much did we earn" and "until when is this driver covered", and
-- a malformed row corrupts both answers quietly.
ALTER TABLE "SubscriptionPayment"
  ADD CONSTRAINT "SubscriptionPayment_kind_fields_check" CHECK (
    (
      "kind" = 'SUBSCRIPTION'
      AND "planCode" IS NOT NULL
      AND "durationMonths" IS NOT NULL
      AND "periodStart" IS NOT NULL
      AND "periodEnd" IS NOT NULL
      AND "promotionDays" IS NULL
    )
    OR (
      "kind" = 'PROMOTION'
      AND "promotionDays" IS NOT NULL
      AND "planCode" IS NULL
      AND "durationMonths" IS NULL
      AND "periodStart" IS NULL
      AND "periodEnd" IS NULL
    )
  );

-- The refresh allowance: six per Armenia calendar day.
--
-- Two columns rather than a table of refreshes, because nothing ever reads a
-- refresh's history — only "how many today". The day is stored as the Armenia
-- date key (`YYYY-MM-DD`, see `common/armenia-day.ts`) rather than a timestamp
-- so that "today" means the same thing to a server in Yerevan and a server in
-- UTC, which is the same reason the analytics tables store one.
--
-- A new day is not a scheduled reset: the count is read together with the day
-- it belongs to, and a day that is not today reads as zero. There is no cron
-- here and nothing to be late.
ALTER TABLE "TowTruck"
  ADD COLUMN "promotionBumpDay" TEXT,
  ADD COLUMN "promotionBumpCount" INTEGER NOT NULL DEFAULT 0;

-- No index on either. `promotionBumpDay`/`promotionBumpCount` are read one
-- driver at a time, by primary key, on the driver's own dashboard — there is no
-- query that would scan on them.
