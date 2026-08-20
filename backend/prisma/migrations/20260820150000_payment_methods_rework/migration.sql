-- Retire the `receipt-provided` service slug («ՀԴՄ կտրոն»).
--
-- The payment group asked six questions as if they were six alternatives, and
-- two of them were not payment methods at all: a fiscal receipt and an invoice
-- are documents you get *after* paying. «ՀԴՄ կտրոն» is also not a choice a
-- driver makes — a registered business issues one, so ticking it said nothing a
-- customer could act on.
--
-- The group is now the four real methods (cash, transfer to card, transfer to
-- account, POS), and `invoice-provided` survives as its own checkbox outside
-- the group, because that one IS a real filter: a company car cannot use a
-- driver who has no invoice to give accounting.
--
-- ## Only the slug is retired — no wording change needs a migration
--
-- The other four slugs are **unchanged**. Their Armenian labels got more
-- specific («Անկանխիկ փոխանցում» → «Փոխանցում բանկային քարտին»), but labels live
-- entirely in the frontend (`SERVICE_LABELS`), so every existing driver's
-- answer carries over untouched and reads better than it did.
--
-- ## Same three tables as the night-service removal, same reasoning
--
-- A slug left in the data with no label anywhere prints raw in the public list
-- and in the moderation diff, and has no checkbox left to remove it with. See
-- `20260820140000_drop_night_service_slug` for the argument in full.
--
-- `array_remove` is a no-op on rows that never had it, so re-running this
-- changes nothing.
UPDATE "TowTruck"
SET services = array_remove(services, 'receipt-provided')
WHERE 'receipt-provided' = ANY (services);

UPDATE "RegistrationRequest"
SET services = array_remove(services, 'receipt-provided')
WHERE 'receipt-provided' = ANY (services);

-- PENDING only: an approved or rejected change request is the record of what a
-- moderator actually saw, and rewriting it would misrepresent that.
UPDATE "ProfileChangeRequest"
SET changes = jsonb_set(
      changes::jsonb,
      '{services}',
      (
        SELECT COALESCE(jsonb_agg(value), '[]'::jsonb)
        FROM jsonb_array_elements(changes::jsonb -> 'services') AS value
        WHERE value <> '"receipt-provided"'::jsonb
      )
    )
WHERE status = 'PENDING'
  AND jsonb_typeof(changes::jsonb -> 'services') = 'array'
  AND changes::jsonb -> 'services' @> '"receipt-provided"'::jsonb;
