-- Specialist vehicle profiles: «Մանիպուլյատոր» and «Ծանր տեխնիկայի էվակուատոր»
-- now ask their own technical questions, and «Ծանր տեխնիկայի տեղափոխում»
-- becomes something a driver can claim (subject to moderation) rather than
-- something only an admin can grant.
--
-- Every column here is additive and nullable/defaulted. Nothing is backfilled
-- and nothing is dropped: every existing row is an ordinary evacuator that was
-- never asked any of these questions, and NULL is the honest record of that.
-- An invented 0 would be indistinguishable from a real answer of zero and
-- would render as a specification on the public profile (see
-- `numberFieldText` in frontend/utils/registrationForm.ts for the same bug
-- caught on the pricing fields).

-- AlterTable: technical specifications, live profiles
--
-- craneCapacityTons / craneReachM are the manipulator's crane rating and reach.
-- maxLoadTons is the exact platform tonnage that REPLACES the capacity band
-- picker for these two types — `capacityTons` is written from it directly
-- rather than from `representativeCapacityTons(capacityRange)`, because
-- «10 տոննայից ավելի» is the only band a machinery transporter ever falls in
-- and it answers nothing.
-- platformLoadHeightCm is the transporter's deck height: whether a low-clearance
-- machine can be driven on at all.
ALTER TABLE "TowTruck" ADD COLUMN "craneCapacityTons" DOUBLE PRECISION;
ALTER TABLE "TowTruck" ADD COLUMN "craneReachM" DOUBLE PRECISION;
ALTER TABLE "TowTruck" ADD COLUMN "maxLoadTons" DOUBLE PRECISION;
ALTER TABLE "TowTruck" ADD COLUMN "platformLoadHeightCm" DOUBLE PRECISION;

-- AlterTable: the same four on the moderation queue, so approve() stays a
-- straight copy — the arrangement platformLengthM/platformWidthM already have.
ALTER TABLE "RegistrationRequest" ADD COLUMN "craneCapacityTons" DOUBLE PRECISION;
ALTER TABLE "RegistrationRequest" ADD COLUMN "craneReachM" DOUBLE PRECISION;
ALTER TABLE "RegistrationRequest" ADD COLUMN "maxLoadTons" DOUBLE PRECISION;
ALTER TABLE "RegistrationRequest" ADD COLUMN "platformLoadHeightCm" DOUBLE PRECISION;

-- AlterTable: a driver may now CLAIM «Ծանր տեխնիկայի տեղափոխում» at sign-up.
--
-- `TowTruck.heavyEquipment` keeps its meaning exactly — "what a human moderator
-- decided" — because this column is a request, not the flag. It is read by the
-- admin review page, which submits the whole profile; whatever the moderator
-- leaves ticked is what reaches TowTruck. The self-promotion hole the flag was
-- made admin-only to close (see backend/src/tow-trucks/vehicle-types.ts) stays
-- closed: a driver's answer never reaches a live profile unreviewed, on this
-- path or on the dashboard's, which queues a diff.
ALTER TABLE "RegistrationRequest" ADD COLUMN "heavyEquipment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: «Ամբողջ Հայաստան» as a coverage answer in its own right.
--
-- Not eleven rows in `serviceAreas`: "everywhere" is one decision, and spelling
-- it as a full region list would be indistinguishable from a driver who
-- deliberately ticked all eleven, so it could never later be presented back to
-- them as the choice they made. It also has to survive a marz being added.
--
-- Offered only to the specialist vehicles and only because the coverage cap
-- does not apply to them: a crane truck genuinely does travel the country for a
-- booked job, which is the opposite of the roadside evacuator the 2/3/5-area
-- budget was written for.
ALTER TABLE "TowTruck" ADD COLUMN "servesAllArmenia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RegistrationRequest" ADD COLUMN "servesAllArmenia" BOOLEAN NOT NULL DEFAULT false;
