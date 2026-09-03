-- Turns the admin's old manual bookkeeping (TowTruck.lastPaymentAt) into real
-- subscription rows, so that switching the /admin/payments status over to
-- "how long is this driver's period" does not flip every currently-paid
-- driver to "unpaid" on the deploy that ships it.
--
-- ## Why LEGACY_MONTHLY and amount 0
--
-- These rows are RECONSTRUCTED, not recorded. All we ever stored was a single
-- date meaning "an admin marked them paid, and the status expires ~30 days
-- later" — we do not know what any of them actually paid, and inventing
-- today's 3000 would put a number nobody transacted into a payment record.
-- So: a plan code that is deliberately NOT in subscription-plans.ts (the API
-- falls back to showing the raw code — see toSubscriptionPaymentApi) and an
-- amount of 0 meaning "unknown, predates real payments".
--
-- One month of coverage from the marked date, which is exactly what the old
-- 30-day threshold meant, so no driver's status changes on the day of the
-- deploy.
--
-- Idempotent: re-running it cannot double up, because it skips any driver who
-- already has a LEGACY_MONTHLY row.
INSERT INTO "SubscriptionPayment" (
    "towTruckId", "planCode", "amount", "currency", "durationMonths",
    "periodStart", "periodEnd", "status", "createdAt", "updatedAt"
)
SELECT
    t."id",
    'LEGACY_MONTHLY',
    0,
    'AMD',
    1,
    t."lastPaymentAt",
    t."lastPaymentAt" + INTERVAL '1 month',
    'PAID',
    t."lastPaymentAt",
    NOW()
FROM "TowTruck" t
WHERE t."lastPaymentAt" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "SubscriptionPayment" s
      WHERE s."towTruckId" = t."id" AND s."planCode" = 'LEGACY_MONTHLY'
  );
