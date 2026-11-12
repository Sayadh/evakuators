-- The driver chooses the ring of a new order in the app («Զանգի ձայն»,
-- 2026-11). iOS plays the sound file the APNs push names, so the server has
-- to know the choice: it comes with the push token (POST
-- /driver-app/me/push-token `sound`) and is kept per device token — each
-- phone of a driver may ring differently. NULL = the original ring.
-- The allowed ids are checked by the app server (notify/push.service.ts
-- ALERT_SOUNDS); the CHECK only keeps the column to a safe identifier.
-- Additive only.
ALTER TABLE "PushDeviceToken"
  ADD COLUMN "alertSound" TEXT,
  ADD CONSTRAINT "PushDeviceToken_alertSound_check" CHECK ("alertSound" IS NULL OR "alertSound" ~ '^[a-z][a-z0-9_]{0,31}$');
