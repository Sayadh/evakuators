-- When an admin acknowledged a completed payment.
--
-- The admin queue changed meaning. It used to be a DECISION queue: a driver's
-- request sat there until an admin confirmed it, and only then did coverage
-- start. With Idram wired up that is no longer how a payment completes — the
-- provider's callback confirms it, the driver is active immediately, and
-- nobody should be waiting on an admin to be paid for something they already
-- paid for.
--
-- So the queue is now a REVIEW list: payments that really went through, shown
-- once so an admin can see them and tick them off. `reviewedAt` is that tick.
-- Nothing about it grants, revokes or changes money — it only decides whether
-- a row is still on the admin's screen, which is why it is a nullable
-- timestamp and not a status.
--
-- NULL for every existing row, which is exactly true: nobody has reviewed any
-- of them, because until now there was nothing to review.
ALTER TABLE "SubscriptionPayment" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- The queue's own query: unreviewed PAID rows, oldest first. Partial, on the
-- rows that can actually appear — a reviewed payment never comes back, and the
-- table is dominated by rows the queue will never look at.
CREATE INDEX IF NOT EXISTS "SubscriptionPayment_review_idx"
    ON "SubscriptionPayment" ("createdAt")
    WHERE "status" = 'PAID' AND "reviewedAt" IS NULL;
