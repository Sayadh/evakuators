-- In-house error tracking (2026-11-17, instead of an outside service): one
-- row per DISTINCT error — same source, same message shape, same top stack
-- frame — with a counter, so a crash loop is one row with a big number rather
-- than a table that fills the disk. Written by the API (5xx), the worker
-- (failed outbox jobs, reconciler), the admin pages and the driver app
-- (POST /api/v1/errors/client). Read on /admin/orders/errors.
CREATE TABLE "ErrorGroup" (
  "id"          SERIAL NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "source"      TEXT NOT NULL,
  "message"     TEXT NOT NULL,
  "stack"       TEXT,
  "context"     JSONB NOT NULL DEFAULT '{}',
  "release"     TEXT,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "lastSeenAt"  TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "resolvedAt"  TIMESTAMPTZ(3),
  CONSTRAINT "ErrorGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ErrorGroup_source_check" CHECK ("source" IN ('api', 'worker', 'admin', 'mobile'))
);
CREATE UNIQUE INDEX "ErrorGroup_fingerprint_key" ON "ErrorGroup" ("fingerprint");
CREATE INDEX "ErrorGroup_open_idx" ON "ErrorGroup" ("lastSeenAt" DESC) WHERE "resolvedAt" IS NULL;
