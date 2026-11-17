-- Pre-orders (2026-11-17): an operator describes a job WITHOUT the customer's
-- contact, EVERY active driver is notified and sees it (no capability filter,
-- 2026-11-18), each may answer with the price he would do it for, and the
-- operator decides whom to call or send it to (converting it into a real order
-- with that price — as many times as needed: converting never closes it).
-- Only the operator closes it; there is no deadline. Closed pre-orders of past
-- months are purged at the start of each month (pre-orders.ts purgePastMonths).
-- Separate from "DispatchOrder" on purpose: no status machine, no offers, no
-- fees — only a price collection. See live-dispatch/pre-orders/pre-orders.ts.
CREATE TABLE "PreOrder" (
  "id"                  SERIAL NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'OPEN',
  "createdByUserId"     INTEGER,
  "pickupLatitude"      NUMERIC(9, 6),
  "pickupLongitude"     NUMERIC(9, 6),
  "pickupAddress"       TEXT NOT NULL,
  "pickupPrecision"     TEXT,
  "destinationLatitude" NUMERIC(9, 6),
  "destinationLongitude" NUMERIC(9, 6),
  "destinationAddress"  TEXT,
  "vehicleMake"         TEXT,
  "vehicleModel"        TEXT,
  "vehicleWeightKg"     INTEGER,
  "wheelsRoll"          BOOLEAN,
  "steeringLocked"      BOOLEAN,
  "gearboxLocked"       BOOLEAN,
  "needsManipulator"    BOOLEAN,
  "needsWheelSkates"    BOOLEAN,
  "wheelSkatesCount"    SMALLINT,
  -- What the drivers read
  "comment"             TEXT NOT NULL DEFAULT '',
  -- Operator only: never in a driver's view
  "customerPhone"       TEXT,
  "customerName"        TEXT,
  "internalNote"        TEXT,
  "closedAt"            TIMESTAMPTZ(3),
  "closedByUserId"      INTEGER,
  -- Pushes sent: rounds (1 at creation, +1 per «Կրկին ծանուցել») and the
  -- drivers reached by the last round
  "notifyRounds"        INTEGER NOT NULL DEFAULT 0,
  "notifiedDrivers"     INTEGER NOT NULL DEFAULT 0,
  "notifiedAt"          TIMESTAMPTZ(3),
  "createdAt"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PreOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreOrder_status_check" CHECK ("status" IN ('OPEN', 'CLOSED')),
  CONSTRAINT "PreOrder_closed_check" CHECK (("status" = 'OPEN') = ("closedAt" IS NULL)),
  CONSTRAINT "PreOrder_precision_check" CHECK ("pickupPrecision" IS NULL OR "pickupPrecision" IN ('EXACT', 'APPROXIMATE'))
);
CREATE INDEX "PreOrder_open_idx" ON "PreOrder" ("createdAt" DESC) WHERE "status" = 'OPEN';

-- One price per driver per pre-order; he may change or withdraw it while it is open.
-- Every ACTIVE driver sees every open pre-order (2026-11-18, no capability
-- filter) — so there is no recipient list; any driver may answer.
CREATE TABLE "PreOrderBid" (
  "preOrderId" INTEGER NOT NULL,
  "driverId"   INTEGER NOT NULL,
  "priceAmd"   INTEGER NOT NULL,
  "createdAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PreOrderBid_pkey" PRIMARY KEY ("preOrderId", "driverId"),
  CONSTRAINT "PreOrderBid_price_check" CHECK ("priceAmd" > 0),
  CONSTRAINT "PreOrderBid_preOrderId_fkey" FOREIGN KEY ("preOrderId") REFERENCES "PreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreOrderBid_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PreOrderBid_driver_idx" ON "PreOrderBid" ("driverId", "updatedAt" DESC);

-- The orders made from a pre-order, one per «Պատվեր տալ» (2026-11-17). Several
-- are allowed — the first driver declined, the operator gives it to the next.
CREATE TABLE "PreOrderConversion" (
  "orderId"         INTEGER NOT NULL,
  "preOrderId"      INTEGER NOT NULL,
  "driverId"        INTEGER NOT NULL,
  "priceAmd"        INTEGER NOT NULL,
  "createdByUserId" INTEGER,
  "createdAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "PreOrderConversion_pkey" PRIMARY KEY ("orderId"),
  CONSTRAINT "PreOrderConversion_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PreOrderConversion_preOrderId_fkey" FOREIGN KEY ("preOrderId") REFERENCES "PreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PreOrderConversion_preOrder_idx" ON "PreOrderConversion" ("preOrderId", "createdAt");
