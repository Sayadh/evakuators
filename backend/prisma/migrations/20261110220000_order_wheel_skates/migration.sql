-- An operator can state that the job needs wheel skates («անիվային
-- ռոլիկներ»), and optionally how many (1–4) — product decision, 2026-11.
--
-- "needsWheelSkates" is three-valued like the other requirements (NULL = not
-- asked). TRUE restricts dispatch to trucks that HAVE wheel skates (a crane is
-- not accepted instead: the operator asked for skates). The count is for the
-- driver to read — no driver profile records how many skates a truck carries,
-- so it is never a filter.
--
-- Additive only.
ALTER TABLE "DispatchOrder"
  ADD COLUMN "needsWheelSkates" BOOLEAN,
  ADD COLUMN "wheelSkatesCount" SMALLINT,
  ADD CONSTRAINT "DispatchOrder_wheelSkatesCount_check" CHECK ("wheelSkatesCount" IS NULL OR "wheelSkatesCount" BETWEEN 1 AND 4);
