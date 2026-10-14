-- «Ամբողջ սպասարկման տարածքում» — a second placement product beside
-- «Իմ քաղաքում վերևում», on the same payment row and the same Idram path.

CREATE TYPE "PromotionScope" AS ENUM ('HOME', 'AREA');

ALTER TABLE "SubscriptionPayment" ADD COLUMN "promotionScope" "PromotionScope";

-- Every placement sold before this migration was the home-town product.
UPDATE "SubscriptionPayment" SET "promotionScope" = 'HOME' WHERE "kind" = 'PROMOTION';

-- Same constraint as before, with the scope held to the same rule as the day
-- count: required on a placement, absent on a subscription.
ALTER TABLE "SubscriptionPayment" DROP CONSTRAINT "SubscriptionPayment_kind_fields_check";
ALTER TABLE "SubscriptionPayment"
  ADD CONSTRAINT "SubscriptionPayment_kind_fields_check" CHECK (
    (
      "kind" = 'SUBSCRIPTION'
      AND "planCode" IS NOT NULL
      AND "durationMonths" IS NOT NULL
      AND "periodStart" IS NOT NULL
      AND "periodEnd" IS NOT NULL
      AND "promotionDays" IS NULL
      AND "promotionScope" IS NULL
    )
    OR (
      "kind" = 'PROMOTION'
      AND "promotionDays" IS NOT NULL
      AND "promotionScope" IS NOT NULL
      AND "planCode" IS NULL
      AND "durationMonths" IS NULL
      AND "periodStart" IS NULL
      AND "periodEnd" IS NULL
    )
  );

ALTER TABLE "TowTruck" ADD COLUMN "areaFeaturedUntil" TIMESTAMP(3);
