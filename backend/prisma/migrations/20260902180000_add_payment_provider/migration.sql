-- Where a confirmed payment came from, and the provider's own id for it.
--
-- Both nullable and additive: every existing row is either a reconstructed
-- legacy record or a payment an admin recorded by hand, and "no provider" is
-- exactly true of both.
--
-- The unique index on providerTransactionId is the part that matters. A
-- gateway retries any callback it did not hear "OK" from, so the same
-- transaction arrives more than once by design — without this, a retry would
-- confirm a second time and grant a second month for one payment. Postgres
-- treats NULLs as distinct, so the hand-recorded rows (all null) do not
-- collide with each other.
ALTER TABLE "SubscriptionPayment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "SubscriptionPayment" ADD COLUMN IF NOT EXISTS "providerTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionPayment_providerTransactionId_key"
    ON "SubscriptionPayment"("providerTransactionId");
