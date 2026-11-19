-- Site-wide settings an admin switches from /admin (2026-11-18). First one:
-- "design" — 1 (the homepage hero with «Ազատ երթուղիներ» and «Գտնել
-- մոտակա» buttons) or 2 (those two hidden everywhere, the phone number made
-- the main call to action). Key/value so the next switch needs no migration.
-- Read with raw SQL (site-settings.service.ts), like the live-dispatch tables:
-- not modelled in schema.prisma, so `prisma migrate diff` would list a DROP —
-- never apply that diff (docs/data-model.md § Migrations).
CREATE TABLE "SiteSetting" (
  "key"       TEXT NOT NULL,
  "value"     JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "updatedByUserId" INTEGER,
  CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);
