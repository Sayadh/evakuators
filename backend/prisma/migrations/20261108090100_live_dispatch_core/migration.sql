-- Live dispatch: app drivers (FleetDriver), driver presence/location, orders,
-- offers, assignments, audit trail, outbox, idempotency, settings.
--
-- ADDITIVE ONLY. No existing table, column, index or enum value is altered or
-- dropped, and nothing is backfilled. Rolling the application back leaves
-- these tables unused and harmless (see docs/live-dispatch/09-rollout-and-rollback.md).
--
-- All timestamps here are TIMESTAMPTZ(3), unlike the TIMESTAMP(3) columns the
-- rest of the schema uses. Every deadline in this feature is compared against
-- `now()` inside SQL, and a timestamptz comparison cannot be shifted by the
-- server's TimeZone setting — the exact bug `common/sql-utc.ts` exists to work
-- around for the older columns.
--
-- The correctness of dispatch rests on the partial unique indexes below, not
-- on application code. Each one is named so the error mapping in
-- `live-dispatch/platform/errors.ts` can tell them apart.

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "DispatchOrderStatus" AS ENUM (
  'DRAFT', 'SEARCHING', 'PRICE_CONFIRMATION_PENDING', 'ASSIGNED',
  'EN_ROUTE_TO_PICKUP', 'ARRIVED_AT_PICKUP', 'TRANSPORTING',
  'COMPLETED', 'NEEDS_ATTENTION', 'CANCELLED'
);

CREATE TYPE "OrderOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REVOKED');

CREATE TYPE "DispatchOrderSource" AS ENUM ('ADMIN', 'WEBSITE');

CREATE TYPE "OrderPricingMode" AS ENUM ('FIXED', 'NEGOTIATION_REQUIRED');

CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNKNOWN', 'UNPAID', 'PAID');

CREATE TYPE "OrderAttentionKind" AS ENUM (
  'SEARCH_EXHAUSTED', 'SEARCH_TIMEOUT', 'MANUAL_OFFER_FAILED',
  'DRIVER_CANCEL_REQUEST', 'DRIVER_PROBLEM', 'OPERATOR_FLAG'
);

CREATE TYPE "OrderCancelReason" AS ENUM (
  'DRIVER_CANNOT_PERFORM', 'CUSTOMER_DECLINED', 'WRONG_DATA',
  'PRICE_NOT_AGREED', 'TECHNICAL_PROBLEM', 'OTHER'
);

-- ─── Fleet drivers: who may use the driver app ─────────────────────────────
--
-- Two concepts the rest of the platform must never mix:
--
--   * a SITE LISTING  — "TowTruck": the public profile, SEO pages, reviews,
--     subscription. Untouched by this feature.
--   * an APP DRIVER   — "FleetDriver": permission to use the driver app and
--     receive orders. Every live-dispatch table points HERE, never at TowTruck.
--
-- A FleetDriver is one of two kinds, and the CHECK below makes the shapes
-- impossible to blur:
--
--   SITE_LINKED — a driver already listed on the site whom an admin GRANTED
--                 app access. One row per TowTruck at most. Signs in with the
--                 SAME phone + password as the site (the TowTruck row stays the
--                 only credential), and their vehicle data is the moderated
--                 TowTruck data. No credential or vehicle column here is used.
--   APP_ONLY    — someone who registered in the app and is NOT on the site.
--                 Owns its phone/password/vehicle columns here, starts as
--                 PENDING_REVIEW, and appears nowhere public — ever.
--
-- Keeping the id separate from TowTruck.id is what lets an APP_ONLY driver be
-- linked to a site profile later without rewriting their order history.
CREATE TYPE "FleetDriverKind" AS ENUM ('SITE_LINKED', 'APP_ONLY');
CREATE TYPE "FleetDriverStatus" AS ENUM ('PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED');

CREATE TABLE "FleetDriver" (
  "id"                 SERIAL NOT NULL,
  "kind"               "FleetDriverKind" NOT NULL,
  "status"             "FleetDriverStatus" NOT NULL,
  "towTruckId"         INTEGER,
  -- APP_ONLY only (NULL for SITE_LINKED — the TowTruck row is the source):
  "phone"              TEXT,
  "passwordHash"       TEXT,
  "driverName"         TEXT,
  "vehicleType"        TEXT,
  "capacityTons"       DOUBLE PRECISION,
  "maxLoadTons"        DOUBLE PRECISION,
  "manipulator"        BOOLEAN,
  "wheelSkates"        BOOLEAN,
  "vehicleDescription" TEXT,
  -- Who changed the status last, and why (grant, approve, reject, suspend).
  "statusChangedAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "statusChangedBy"    INTEGER,
  "statusReason"       TEXT,
  "createdAt"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "FleetDriver_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetDriver_shape_check" CHECK (
    ("kind" = 'SITE_LINKED' AND "towTruckId" IS NOT NULL
       AND "phone" IS NULL AND "passwordHash" IS NULL AND "driverName" IS NULL
       AND "vehicleType" IS NULL AND "capacityTons" IS NULL AND "maxLoadTons" IS NULL
       AND "manipulator" IS NULL AND "wheelSkates" IS NULL AND "vehicleDescription" IS NULL
       AND "status" <> 'PENDING_REVIEW' AND "status" <> 'REJECTED')
    OR
    ("kind" = 'APP_ONLY' AND "towTruckId" IS NULL
       AND "phone" IS NOT NULL AND "passwordHash" IS NOT NULL AND "driverName" IS NOT NULL
       AND "vehicleType" IS NOT NULL AND "capacityTons" IS NOT NULL
       AND "manipulator" IS NOT NULL AND "wheelSkates" IS NOT NULL)
  ),
  CONSTRAINT "FleetDriver_capacity_check" CHECK ("capacityTons" IS NULL OR "capacityTons" > 0),
  CONSTRAINT "FleetDriver_towTruckId_fkey" FOREIGN KEY ("towTruckId")
    REFERENCES "TowTruck"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FleetDriver_towTruckId_key" ON "FleetDriver" ("towTruckId");
-- Same canonical +374XXXXXXXX shape as TowTruck.phone. Uniqueness ACROSS the
-- two tables cannot be a constraint; FleetService checks it under an advisory
-- lock on the phone (and login always resolves the site first).
CREATE UNIQUE INDEX "FleetDriver_phone_key" ON "FleetDriver" ("phone") WHERE "phone" IS NOT NULL;
CREATE INDEX "FleetDriver_status_idx" ON "FleetDriver" ("status", "createdAt");

-- Append-only history of access decisions (grant, register, approve, reject,
-- suspend, reactivate, link) — the "who let this person in" record.
CREATE TABLE "FleetDriverEvent" (
  "id"          BIGSERIAL NOT NULL,
  "driverId"    INTEGER NOT NULL,
  "type"        TEXT NOT NULL,
  "actorUserId" INTEGER,
  "data"        JSONB NOT NULL DEFAULT '{}',
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "FleetDriverEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FleetDriverEvent_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FleetDriverEvent_driverId_id_idx" ON "FleetDriverEvent" ("driverId", "id");

-- What dispatch reads about a driver, whichever kind: ONE shape, so the
-- eligibility SQL never branches on kind. `isActive` = may receive orders now:
-- access ACTIVE, and for a site driver also listed (TowTruck.isActive) — a
-- driver an admin took off the site does not keep getting orders through the
-- back door. `towTruckId` is non-NULL exactly for drivers with a public card.
CREATE VIEW "FleetDriverProfile" AS
SELECT
  d."id",
  d."kind",
  d."status",
  d."towTruckId",
  (d."status" = 'ACTIVE' AND (d."kind" = 'APP_ONLY' OR tt."isActive" IS TRUE)) AS "isActive",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."driverName"   ELSE d."driverName"   END AS "driverName",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."phone"        ELSE d."phone"        END AS "phone",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."vehicleType"  ELSE d."vehicleType"  END AS "vehicleType",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."capacityTons" ELSE d."capacityTons" END AS "capacityTons",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."maxLoadTons"  ELSE d."maxLoadTons"  END AS "maxLoadTons",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."manipulator"  ELSE d."manipulator"  END AS "manipulator",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."wheelSkates"  ELSE d."wheelSkates"  END AS "wheelSkates",
  CASE WHEN d."kind" = 'SITE_LINKED' THEN tt."slug"         ELSE NULL             END AS "slug"
FROM "FleetDriver" d
LEFT JOIN "TowTruck" tt ON tt."id" = d."towTruckId";

-- ─── Driver devices and presence ────────────────────────────────────────────

-- One row per app login. The JWT the app holds carries this id as `sid`, and
-- every app request checks the row is not revoked — which is what makes
-- "log out", "this device replaced that one" and "admin revoked access" real,
-- something the 30-day web token has never been able to do.
CREATE TABLE "DriverDeviceSession" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "driverId"   INTEGER NOT NULL,
  "deviceId"     TEXT NOT NULL,
  "platform"     TEXT NOT NULL,
  "appVersion"   TEXT,
  "createdAt"    TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "lastSeenAt"   TIMESTAMPTZ(3),
  "revokedAt"    TIMESTAMPTZ(3),
  "revokeReason" TEXT,
  CONSTRAINT "DriverDeviceSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverDeviceSession_platform_check" CHECK ("platform" IN ('ios', 'android')),
  CONSTRAINT "DriverDeviceSession_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- One live tracking session per driver (first version). A new login revokes
-- the previous row in the same transaction; this index is the backstop.
CREATE UNIQUE INDEX "DriverDeviceSession_one_active_per_driver"
  ON "DriverDeviceSession" ("driverId") WHERE "revokedAt" IS NULL;

CREATE TABLE "PushDeviceToken" (
  "id"            SERIAL NOT NULL,
  "sessionId"     UUID NOT NULL,
  "driverId"    INTEGER NOT NULL,
  "provider"      TEXT NOT NULL DEFAULT 'FCM',
  "token"         TEXT NOT NULL,
  "createdAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "invalidatedAt" TIMESTAMPTZ(3),
  "invalidReason" TEXT,
  CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDeviceToken_sessionId_fkey" FOREIGN KEY ("sessionId")
    REFERENCES "DriverDeviceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PushDeviceToken_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- A token belongs to one live binding at a time: re-registering it from a new
-- session invalidates the old row first.
CREATE UNIQUE INDEX "PushDeviceToken_token_active" ON "PushDeviceToken" ("token") WHERE "invalidatedAt" IS NULL;
CREATE INDEX "PushDeviceToken_driverId_idx" ON "PushDeviceToken" ("driverId") WHERE "invalidatedAt" IS NULL;

-- Deliberately several independent facts, never one `online` boolean:
-- what the driver CHOSE (wantsOnline), whether the app is ALIVE
-- (lastHeartbeatAt), whether they are busy OUTSIDE the platform
-- (externalBusy), and whether an admin has SUSPENDED dispatch for them.
-- Location freshness lives in DriverLocationCurrent; "has an offer/order" is
-- derived from OrderOffer/OrderAssignment. Eligibility combines all of them.
CREATE TABLE "DriverPresence" (
  "driverId"              INTEGER NOT NULL,
  "wantsOnline"             BOOLEAN NOT NULL DEFAULT false,
  "wantsOnlineChangedAt"    TIMESTAMPTZ(3),
  "lastHeartbeatAt"         TIMESTAMPTZ(3),
  "heartbeatSessionId"      UUID,
  "externalBusy"            BOOLEAN NOT NULL DEFAULT false,
  "externalBusyChangedAt"   TIMESTAMPTZ(3),
  "availableSince"          TIMESTAMPTZ(3),
  "dispatchSuspendedAt"     TIMESTAMPTZ(3),
  "dispatchSuspendedReason" TEXT,
  "dispatchSuspendedBy"     INTEGER,
  "trackingConsentVersion"  INTEGER,
  "trackingConsentAt"       TIMESTAMPTZ(3),
  "updatedAt"               TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "DriverPresence_pkey" PRIMARY KEY ("driverId"),
  CONSTRAINT "DriverPresence_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The newest TRUSTED fix per driver. Written only when a fix is newer (by
-- session + sequence + measuredAt) than what is stored — see
-- FleetRepository.ingestLocations — so a late or replayed fix can never move
-- a driver backwards. The PostGIS column is added by the next migration.
CREATE TABLE "DriverLocationCurrent" (
  "driverId"       INTEGER NOT NULL,
  "sessionId"        UUID NOT NULL,
  "seq"              BIGINT NOT NULL,
  "latitude"         DECIMAL(9, 6) NOT NULL,
  "longitude"        DECIMAL(9, 6) NOT NULL,
  "accuracyM"        REAL NOT NULL,
  "speedMps"         REAL,
  "headingDeg"       REAL,
  "measuredAt"       TIMESTAMPTZ(3) NOT NULL,
  "receivedAt"       TIMESTAMPTZ(3) NOT NULL,
  "suspicious"       BOOLEAN NOT NULL DEFAULT false,
  "suspiciousReason" TEXT,
  CONSTRAINT "DriverLocationCurrent_pkey" PRIMARY KEY ("driverId"),
  CONSTRAINT "DriverLocationCurrent_lat_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "DriverLocationCurrent_lng_check" CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "DriverLocationCurrent_accuracy_check" CHECK ("accuracyM" >= 0),
  CONSTRAINT "DriverLocationCurrent_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Bounded history, purged by the worker after `locationHistoryRetentionDays`.
-- `late` marks a fix that arrived too long after it was measured to count as
-- a present position (an offline buffer flushed on reconnect).
CREATE TABLE "DriverLocationHistory" (
  "id"          BIGSERIAL NOT NULL,
  "driverId"  INTEGER NOT NULL,
  "sessionId"   UUID NOT NULL,
  "seq"         BIGINT NOT NULL,
  "latitude"    DECIMAL(9, 6) NOT NULL,
  "longitude"   DECIMAL(9, 6) NOT NULL,
  "accuracyM"   REAL NOT NULL,
  "speedMps"    REAL,
  "headingDeg"  REAL,
  "measuredAt"  TIMESTAMPTZ(3) NOT NULL,
  "receivedAt"  TIMESTAMPTZ(3) NOT NULL,
  "orderId"     INTEGER,
  "late"        BOOLEAN NOT NULL DEFAULT false,
  "suspicious"  BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "DriverLocationHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DriverLocationHistory_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Duplicate delivery of the same fix (retry, offline flush racing a live send)
-- is absorbed by ON CONFLICT DO NOTHING on this key.
CREATE UNIQUE INDEX "DriverLocationHistory_session_seq_key" ON "DriverLocationHistory" ("sessionId", "seq");
CREATE INDEX "DriverLocationHistory_driverId_measuredAt_idx" ON "DriverLocationHistory" ("driverId", "measuredAt");
CREATE INDEX "DriverLocationHistory_receivedAt_idx" ON "DriverLocationHistory" ("receivedAt");

-- ─── Orders ─────────────────────────────────────────────────────────────────

CREATE SEQUENCE "DispatchOrder_number_seq" START 1;

CREATE TABLE "DispatchOrder" (
  "id"                     SERIAL NOT NULL,
  "number"                 TEXT NOT NULL DEFAULT ('EV-' || lpad(nextval('"DispatchOrder_number_seq"')::text, 6, '0')),
  "source"                 "DispatchOrderSource" NOT NULL DEFAULT 'ADMIN',
  "createdByUserId"        INTEGER,
  "customerPhone"          TEXT NOT NULL,
  "customerName"           TEXT,

  "pickupLatitude"         DECIMAL(9, 6) NOT NULL,
  "pickupLongitude"        DECIMAL(9, 6) NOT NULL,
  "pickupAddress"          TEXT NOT NULL,
  "destinationLatitude"    DECIMAL(9, 6),
  "destinationLongitude"   DECIMAL(9, 6),
  "destinationAddress"     TEXT,

  "vehicleMake"            TEXT,
  "vehicleModel"           TEXT,
  "vehiclePlate"           TEXT,
  "vehicleWeightKg"        INTEGER,
  "problemDescription"     TEXT NOT NULL DEFAULT '',

  -- Technical requirements. NULL means "not asked yet" and is NEVER read as
  -- "fine": dispatch cannot start while one is NULL unless an operator
  -- recorded an explicit override (requirementsOverride*), which is audited.
  "wheelsRoll"             BOOLEAN,
  "steeringLocked"         BOOLEAN,
  "gearboxLocked"          BOOLEAN,
  "needsManipulator"       BOOLEAN,
  "requirementsOverrideAt"     TIMESTAMPTZ(3),
  "requirementsOverrideBy"     INTEGER,
  "requirementsOverrideNote"   TEXT,

  -- Price and payment are separate facts with separate lifecycles: an order
  -- can be completed and unpaid, or priced and never started.
  "pricingMode"            "OrderPricingMode" NOT NULL,
  "currency"               TEXT NOT NULL DEFAULT 'AMD',
  "quotedPriceAmd"         INTEGER,
  "agreedPriceAmd"         INTEGER,
  "priceConfirmedAt"       TIMESTAMPTZ(3),
  "priceConfirmedBy"       INTEGER,
  "paymentStatus"          "OrderPaymentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "paymentUpdatedAt"       TIMESTAMPTZ(3),
  "paymentUpdatedBy"       INTEGER,

  "status"                 "DispatchOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "attentionKind"          "OrderAttentionKind",
  "statusBeforeAttention"  "DispatchOrderStatus",
  -- Bumped on every material change to what a driver is being asked to do
  -- (price, pickup, destination, requirements). An offer made under an older
  -- version can no longer be accepted.
  "termsVersion"           INTEGER NOT NULL DEFAULT 1,
  -- Bumped on every write — optimistic concurrency for the admin editor.
  "version"                INTEGER NOT NULL DEFAULT 1,
  "activeAssignmentId"     INTEGER,

  -- Pickup → destination road figures, for the description only. NULL when
  -- the destination is unknown or the provider failed; `routeManual` marks a
  -- value an operator typed in.
  "routeMeters"            INTEGER,
  "routeSeconds"           INTEGER,
  "routeComputedAt"        TIMESTAMPTZ(3),
  "routeProvider"          TEXT,
  "routeManual"            BOOLEAN NOT NULL DEFAULT false,

  "cancelReason"           "OrderCancelReason",
  "cancelComment"          TEXT,
  "internalNote"           TEXT,

  "createdAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"              TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "dispatchStartedAt"      TIMESTAMPTZ(3),
  "assignedAt"             TIMESTAMPTZ(3),
  "enRouteAt"              TIMESTAMPTZ(3),
  "arrivedAt"              TIMESTAMPTZ(3),
  "transportStartedAt"     TIMESTAMPTZ(3),
  "completedAt"            TIMESTAMPTZ(3),
  "cancelledAt"            TIMESTAMPTZ(3),

  CONSTRAINT "DispatchOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DispatchOrder_currency_check" CHECK ("currency" = 'AMD'),
  CONSTRAINT "DispatchOrder_quoted_check" CHECK ("quotedPriceAmd" IS NULL OR "quotedPriceAmd" >= 0),
  CONSTRAINT "DispatchOrder_agreed_check" CHECK ("agreedPriceAmd" IS NULL OR "agreedPriceAmd" >= 0),
  CONSTRAINT "DispatchOrder_weight_check" CHECK ("vehicleWeightKg" IS NULL OR "vehicleWeightKg" BETWEEN 100 AND 60000),
  CONSTRAINT "DispatchOrder_pickup_lat_check" CHECK ("pickupLatitude" BETWEEN -90 AND 90),
  CONSTRAINT "DispatchOrder_pickup_lng_check" CHECK ("pickupLongitude" BETWEEN -180 AND 180),
  CONSTRAINT "DispatchOrder_destination_pair_check" CHECK (
    ("destinationLatitude" IS NULL) = ("destinationLongitude" IS NULL)
  ),
  -- Attention metadata exists exactly when the order needs attention.
  CONSTRAINT "DispatchOrder_attention_check" CHECK (
    ("status" = 'NEEDS_ATTENTION') = ("attentionKind" IS NOT NULL)
  ),
  CONSTRAINT "DispatchOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DispatchOrder_number_key" ON "DispatchOrder" ("number");
CREATE INDEX "DispatchOrder_status_updatedAt_idx" ON "DispatchOrder" ("status", "updatedAt");
CREATE INDEX "DispatchOrder_createdAt_idx" ON "DispatchOrder" ("createdAt");

-- One automatic (or manual) search run. `alertAt` and `deadlineAt` are
-- absolute and stored here, so a worker restart cannot forget them.
CREATE TABLE "DispatchAttempt" (
  "id"              SERIAL NOT NULL,
  "orderId"         INTEGER NOT NULL,
  "number"          INTEGER NOT NULL,
  "mode"            TEXT NOT NULL DEFAULT 'AUTO',
  "startedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "startedByUserId" INTEGER,
  "alertAt"         TIMESTAMPTZ(3) NOT NULL,
  "deadlineAt"      TIMESTAMPTZ(3) NOT NULL,
  "maxOffers"       INTEGER NOT NULL,
  "offersMade"      INTEGER NOT NULL DEFAULT 0,
  "searchStage"     INTEGER NOT NULL DEFAULT 0,
  "endedAt"         TIMESTAMPTZ(3),
  "endReason"       TEXT,
  CONSTRAINT "DispatchAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DispatchAttempt_mode_check" CHECK ("mode" IN ('AUTO', 'MANUAL')),
  CONSTRAINT "DispatchAttempt_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DispatchAttempt_orderId_number_key" ON "DispatchAttempt" ("orderId", "number");
CREATE UNIQUE INDEX "DispatchAttempt_one_open_per_order" ON "DispatchAttempt" ("orderId") WHERE "endedAt" IS NULL;

-- The ranked working list of one attempt: who was considered, in what order,
-- with what road figures, and what happened to each. This is the "already
-- offered in this attempt" memory, and the only place a provider's road
-- figures are reused — for at most `candidateRouteMaxAgeSeconds`.
CREATE TABLE "DispatchCandidate" (
  "id"                 BIGSERIAL NOT NULL,
  "attemptId"          INTEGER NOT NULL,
  "driverId"         INTEGER NOT NULL,
  "batch"              INTEGER NOT NULL,
  "rank"               INTEGER NOT NULL,
  "straightLineMeters" INTEGER NOT NULL,
  "roadMeters"         INTEGER,
  "etaSeconds"         INTEGER,
  "routeOk"            BOOLEAN NOT NULL DEFAULT false,
  "routeError"         TEXT,
  "routedAt"           TIMESTAMPTZ(3),
  "routeProvider"      TEXT,
  "status"             TEXT NOT NULL DEFAULT 'QUEUED',
  "skipReason"         TEXT,
  "createdAt"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "DispatchCandidate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DispatchCandidate_status_check" CHECK ("status" IN ('QUEUED', 'OFFERED', 'SKIPPED')),
  CONSTRAINT "DispatchCandidate_attemptId_fkey" FOREIGN KEY ("attemptId")
    REFERENCES "DispatchAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DispatchCandidate_attempt_truck_key" ON "DispatchCandidate" ("attemptId", "driverId");
CREATE INDEX "DispatchCandidate_attempt_status_rank_idx" ON "DispatchCandidate" ("attemptId", "status", "rank");

CREATE TABLE "OrderOffer" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "orderId"            INTEGER NOT NULL,
  "attemptId"          INTEGER NOT NULL,
  "driverId"         INTEGER NOT NULL,
  "status"             "OrderOfferStatus" NOT NULL DEFAULT 'PENDING',
  "manual"             BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId"    INTEGER,
  "termsVersion"       INTEGER NOT NULL,
  "createdAt"          TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "expiresAt"          TIMESTAMPTZ(3) NOT NULL,
  "respondedAt"        TIMESTAMPTZ(3),
  "roadMeters"         INTEGER,
  "etaSeconds"         INTEGER,
  "straightLineMeters" INTEGER,
  "routeComputedAt"    TIMESTAMPTZ(3),
  "rejectReason"       TEXT,
  "closeReason"        TEXT,
  CONSTRAINT "OrderOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderOffer_deadline_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "OrderOffer_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderOffer_attemptId_fkey" FOREIGN KEY ("attemptId")
    REFERENCES "DispatchAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderOffer_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- THE reservation: a driver holds at most one live offer, platform-wide.
CREATE UNIQUE INDEX "OrderOffer_one_pending_per_driver" ON "OrderOffer" ("driverId") WHERE "status" = 'PENDING';
-- Sequential dispatch: an order has at most one live offer at a time.
CREATE UNIQUE INDEX "OrderOffer_one_pending_per_order" ON "OrderOffer" ("orderId") WHERE "status" = 'PENDING';
-- Never the same driver twice for the same terms in the same attempt. A terms
-- change (new termsVersion) is what legitimately allows a fresh offer.
CREATE UNIQUE INDEX "OrderOffer_attempt_driver_terms_key" ON "OrderOffer" ("attemptId", "driverId", "termsVersion");
CREATE INDEX "OrderOffer_pending_expiresAt_idx" ON "OrderOffer" ("expiresAt") WHERE "status" = 'PENDING';
CREATE INDEX "OrderOffer_driverId_createdAt_idx" ON "OrderOffer" ("driverId", "createdAt");
CREATE INDEX "OrderOffer_orderId_createdAt_idx" ON "OrderOffer" ("orderId", "createdAt");

CREATE TABLE "OrderAssignment" (
  "id"            SERIAL NOT NULL,
  "orderId"       INTEGER NOT NULL,
  "driverId"    INTEGER NOT NULL,
  "offerId"       UUID NOT NULL,
  "startedAt"     TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "endedAt"       TIMESTAMPTZ(3),
  "endReason"     TEXT,
  "endedByUserId" INTEGER,
  CONSTRAINT "OrderAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderAssignment_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderAssignment_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderAssignment_offerId_fkey" FOREIGN KEY ("offerId")
    REFERENCES "OrderOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The two invariants the whole feature exists to keep:
CREATE UNIQUE INDEX "OrderAssignment_one_active_per_order" ON "OrderAssignment" ("orderId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "OrderAssignment_one_active_per_driver" ON "OrderAssignment" ("driverId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "OrderAssignment_offerId_key" ON "OrderAssignment" ("offerId");

ALTER TABLE "DispatchOrder"
  ADD CONSTRAINT "DispatchOrder_activeAssignmentId_fkey" FOREIGN KEY ("activeAssignmentId")
    REFERENCES "OrderAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only audit trail. Every state change writes one row in the same
-- transaction as the change itself.
CREATE TABLE "OrderEvent" (
  "id"        BIGSERIAL NOT NULL,
  "orderId"   INTEGER NOT NULL,
  "type"      TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId"   INTEGER,
  "data"      JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderEvent_actorType_check" CHECK ("actorType" IN ('ADMIN', 'DRIVER', 'SYSTEM')),
  CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "OrderEvent_orderId_id_idx" ON "OrderEvent" ("orderId", "id");

-- Operator alerts that do NOT change order state (slow search, GPS lost on an
-- active order, driver not moving). `dedupeKey` makes raising one idempotent.
CREATE TABLE "OrderAlert" (
  "id"             SERIAL NOT NULL,
  "orderId"        INTEGER NOT NULL,
  "kind"           TEXT NOT NULL,
  "dedupeKey"      TEXT NOT NULL,
  "data"           JSONB NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "acknowledgedAt" TIMESTAMPTZ(3),
  "acknowledgedBy" INTEGER,
  CONSTRAINT "OrderAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderAlert_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderAlert_dedupeKey_key" ON "OrderAlert" ("dedupeKey");
CREATE INDEX "OrderAlert_open_idx" ON "OrderAlert" ("createdAt") WHERE "acknowledgedAt" IS NULL;

-- A driver asking out of an accepted order (or reporting a problem). It never
-- frees the order by itself — an operator resolves it.
CREATE TABLE "OrderDriverRequest" (
  "id"               SERIAL NOT NULL,
  "orderId"          INTEGER NOT NULL,
  "driverId"       INTEGER NOT NULL,
  "kind"             TEXT NOT NULL,
  "reason"           "OrderCancelReason" NOT NULL,
  "comment"          TEXT,
  "status"           TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt"        TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "resolvedAt"       TIMESTAMPTZ(3),
  "resolvedByUserId" INTEGER,
  "resolution"       TEXT,
  CONSTRAINT "OrderDriverRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderDriverRequest_kind_check" CHECK ("kind" IN ('CANCEL', 'PROBLEM')),
  CONSTRAINT "OrderDriverRequest_status_check" CHECK ("status" IN ('OPEN', 'RESOLVED')),
  CONSTRAINT "OrderDriverRequest_other_comment_check" CHECK ("reason" <> 'OTHER' OR length(coalesce("comment", '')) > 0),
  CONSTRAINT "OrderDriverRequest_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderDriverRequest_driverId_fkey" FOREIGN KEY ("driverId")
    REFERENCES "FleetDriver"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrderDriverRequest_one_open_per_order" ON "OrderDriverRequest" ("orderId") WHERE "status" = 'OPEN';

-- Per-offer, per-channel delivery tracking. Four separate facts that must not
-- be collapsed: QUEUED (we intend to send), PROVIDER_ACCEPTED (FCM took it),
-- APP_ACKNOWLEDGED (the app says it rendered it) — and, on OrderOffer, whether
-- the driver actually accepted.
CREATE TABLE "NotificationDelivery" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "offerId"           UUID,
  "orderId"           INTEGER NOT NULL,
  "driverId"        INTEGER NOT NULL,
  "channel"           TEXT NOT NULL,
  "kind"              TEXT NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "error"             TEXT,
  "createdAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "acknowledgedAt"    TIMESTAMPTZ(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_channel_check" CHECK ("channel" IN ('PUSH', 'REALTIME')),
  CONSTRAINT "NotificationDelivery_status_check" CHECK (
    "status" IN ('QUEUED', 'PROVIDER_ACCEPTED', 'PROVIDER_REJECTED', 'APP_ACKNOWLEDGED', 'SKIPPED')
  ),
  CONSTRAINT "NotificationDelivery_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "DispatchOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NotificationDelivery_offer_channel_kind_key"
  ON "NotificationDelivery" ("offerId", "channel", "kind");

-- ─── Platform ───────────────────────────────────────────────────────────────

-- Transactional outbox. A row is written in the SAME transaction as the
-- business change it announces, so "committed but never notified" is
-- impossible — at worst a notification is late or repeated, never lost.
-- `dedupeKey` makes enqueueing idempotent; `availableAt` doubles as the
-- scheduler for delayed jobs (offer expiry).
CREATE TABLE "OutboxEvent" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "topic"       TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "dedupeKey"   TEXT NOT NULL,
  "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 8,
  "lockedUntil" TIMESTAMPTZ(3),
  "lockedBy"    TEXT,
  "processedAt" TIMESTAMPTZ(3),
  "lastError"   TEXT,
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent" ("dedupeKey");
CREATE INDEX "OutboxEvent_due_idx" ON "OutboxEvent" ("availableAt") WHERE "processedAt" IS NULL;
CREATE INDEX "OutboxEvent_processedAt_idx" ON "OutboxEvent" ("processedAt") WHERE "processedAt" IS NOT NULL;

-- Idempotency for mutations. The key row is written in the SAME transaction as
-- the mutation and its stored response, so a retried request either finds the
-- finished answer or waits on the row lock of the one still running.
CREATE TABLE "IdempotencyKey" (
  "scope"          TEXT NOT NULL,
  "key"            TEXT NOT NULL,
  "fingerprint"    TEXT NOT NULL,
  "responseStatus" INTEGER NOT NULL,
  "responseBody"   JSONB NOT NULL,
  "createdAt"      TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "expiresAt"      TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("scope", "key")
);
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey" ("expiresAt");

-- Tunables an ADMIN may change at runtime (validated on write). Absent keys
-- fall back to the defaults in live-dispatch/platform/settings.ts.
CREATE TABLE "DispatchSetting" (
  "key"             TEXT NOT NULL,
  "value"           JSONB NOT NULL,
  "updatedAt"       TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedByUserId" INTEGER,
  CONSTRAINT "DispatchSetting_pkey" PRIMARY KEY ("key")
);

-- Routing provider usage per Armenia day — billable ELEMENTS, not just calls.
-- In the database (not memory) so a restart cannot reset the budget.
CREATE TABLE "RoutingUsageDay" (
  "day"      TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "requests" INTEGER NOT NULL DEFAULT 0,
  "elements" INTEGER NOT NULL DEFAULT 0,
  "errors"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RoutingUsageDay_pkey" PRIMARY KEY ("day", "provider")
);
