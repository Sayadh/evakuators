-- The answer window starts when the offer REACHES the driver — product
-- decision, 2026-11. Before, "expiresAt" was creation + offerTimeoutSeconds,
-- so push latency, a sleeping phone and unlocking ate into the driver's 45 s.
--
-- Now an offer is created with a short DELIVERY window (offerDeliverySeconds,
-- default 15). The first sign that the driver's app has it — a push/realtime
-- ack, or the app reading the offer in GET /driver-app/me — sets
-- "deliveredAt" and moves "expiresAt" to deliveredAt + offerTimeoutSeconds,
-- once (offers.repository.ts `markDelivered`). An offer that never reaches
-- the phone expires at the end of the delivery window and dispatch moves on.
--
-- "expiresAt" stays the single deadline every reader uses (accept/reject,
-- expiry job, reconciler, snapshot). Additive only.
ALTER TABLE "OrderOffer"
  ADD COLUMN "deliveredAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT "OrderOffer_deliveredAt_check" CHECK ("deliveredAt" IS NULL OR "deliveredAt" >= "createdAt");
