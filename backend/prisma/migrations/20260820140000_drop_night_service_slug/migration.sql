-- Retire the `night-service` service slug.
--
-- «Գիշերային սպասարկում» and «24/7 սպասարկում» were the same claim asked twice.
-- Worse, they could disagree — a driver with 24/7 ticked and nights unticked
-- published a contradiction nobody could act on — and the pair had exactly the
-- shape of the «Մանիպուլյատոր» bug this codebase already fixed once: two fields,
-- one question.
--
-- ## Why this is a data migration and not just a taxonomy edit
--
-- The backend stores `services` as an opaque `String[]`, and the Armenian words
-- live entirely in the frontend (`SERVICE_LABELS`). Removing the enum member
-- without touching the rows would leave the slug on every profile that had it,
-- with nothing able to name it: the public list would print a raw
-- `night-service`, the moderation diff would show a column name, and the
-- checkbox to remove it would no longer exist on either form. So the rows are
-- cleaned in the same migration the constant is removed in.
--
-- ## Nothing is lost
--
-- The claim survives wherever it was true: `works24Hours` is derived from
-- `available-24-7` and is unaffected, and `workingHoursText` still says when a
-- driver who is not 24/7 actually works.
--
-- `priceNightSurchargePercent` is deliberately NOT touched. It is a price, not
-- a service — "I work at night" and "I charge more after midnight" are
-- different answers, and only the first was the duplicate.
--
-- ## Shape
--
-- `array_remove` rather than a rewrite: it drops every occurrence and leaves
-- the remaining order untouched, and it is a no-op on rows that never had it.
-- Re-running this migration would change nothing, which is the property that
-- makes it safe to apply to a database someone has already fixed by hand.
UPDATE "TowTruck"
SET services = array_remove(services, 'night-service')
WHERE 'night-service' = ANY (services);

-- The moderation queue too. A pending request carrying the slug would otherwise
-- reintroduce it the moment a moderator approved it — the row is the audit
-- trail, but it is also what `approve()` publishes.
UPDATE "RegistrationRequest"
SET services = array_remove(services, 'night-service')
WHERE 'night-service' = ANY (services);

-- And the third queue, which is the one easiest to forget.
--
-- A PENDING `ProfileChangeRequest` holds the driver's proposed `services` as
-- JSON, and approving it spreads that array straight into a Prisma update
-- (`profile-change-diff.ts`). Cleaning the two tables above but not this one
-- would put the slug back on a live profile hours after it was removed, via a
-- click nobody would connect to this migration.
--
-- Only PENDING rows are touched: APPROVED and REJECTED ones are history, and
-- rewriting history would misrepresent what a moderator actually saw.
UPDATE "ProfileChangeRequest"
SET changes = jsonb_set(
      changes::jsonb,
      '{services}',
      (
        SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
        FROM jsonb_array_elements(changes::jsonb -> 'services') AS value
        WHERE value <> '"night-service"'::jsonb
      )
    )
WHERE status = 'PENDING'
  AND jsonb_typeof(changes::jsonb -> 'services') = 'array'
  AND changes::jsonb -> 'services' @> '"night-service"'::jsonb;
