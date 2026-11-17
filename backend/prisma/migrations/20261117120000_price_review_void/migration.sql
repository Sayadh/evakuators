-- A minimum-price review belongs to ONE assignment. When that driver leaves
-- the order (he cancelled, or an operator released him) the review is VOID:
-- left PENDING it blocked the NEXT driver's own minimum price (the
-- one-pending-per-order index made his price confirmation fail), and an
-- operator's CORRECT on it wrote a price onto an order another driver was
-- now negotiating (2026-11-17). The fee itself is settled by the release
-- (refunded for every driver cancel), so nothing is owed on a void review.
ALTER TABLE "OrderPriceReview" DROP CONSTRAINT "OrderPriceReview_status_check";
ALTER TABLE "OrderPriceReview" DROP CONSTRAINT "OrderPriceReview_resolution_check";
ALTER TABLE "OrderPriceReview" ADD CONSTRAINT "OrderPriceReview_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'CORRECTED', 'VOID'));
ALTER TABLE "OrderPriceReview" ADD CONSTRAINT "OrderPriceReview_resolution_check" CHECK (
  ("status" = 'PENDING' AND "resolvedAt" IS NULL)
  OR ("status" IN ('APPROVED', 'VOID') AND "resolvedAt" IS NOT NULL)
  OR ("status" = 'CORRECTED' AND "resolvedAt" IS NOT NULL AND "correctedPriceAmd" IS NOT NULL)
);
