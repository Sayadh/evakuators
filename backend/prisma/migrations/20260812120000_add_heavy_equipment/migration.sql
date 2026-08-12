-- AlterTable: admin-set "can move heavy machinery" flag — what puts a truck on
-- /tsanr-tehnika alongside those whose vehicleType is already 'heavy-duty'.
--
-- Unlike winch/manipulator/wheelSkates this is NOT a driver answer: there is no
-- registration column for it, on purpose, so RegistrationRequest is untouched.
ALTER TABLE "TowTruck" ADD COLUMN "heavyEquipment" BOOLEAN NOT NULL DEFAULT false;

-- Deliberately NOT backfilled for `vehicleType = 'heavy-duty'`.
--
-- Those trucks already appear on /tsanr-tehnika: the listing filter ORs the
-- type with this flag, and the admin panel derives the same union, so a
-- backfill would change nothing an admin or a visitor can see. What it WOULD
-- do is outlive its reason — a driver may change their vehicle type away from
-- `heavy-duty` on their own dashboard, and a stored `true` would leave a
-- flatbed permanently on a page only an admin can put anyone on.
--
-- The column means "what an admin decided", nothing else. `false` is correct
-- for every existing row.
