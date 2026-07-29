-- Replace RegistrationRequest's free-text platform dimensions with the same two
-- typed columns TowTruck already uses, so approval becomes a straight copy
-- instead of a parse.

-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN "platformLengthM" DOUBLE PRECISION;
ALTER TABLE "RegistrationRequest" ADD COLUMN "platformWidthM" DOUBLE PRECISION;

-- Backfill from the old string. The frontend validated the format on the way
-- in (digits, optional decimal, optional մ/m, x/×/*), so this matches every
-- value that could legitimately be stored. Anything that somehow doesn't match
-- yields NULL — which is the same "not specified" the column already allows,
-- and no worse than the value was: nothing ever read this field until now.
UPDATE "RegistrationRequest" AS r
SET "platformLengthM" = replace(parts[1], ',', '.')::double precision,
    "platformWidthM"  = replace(parts[2], ',', '.')::double precision
FROM (
  SELECT
    "id",
    regexp_match(
      "platformDimensions",
      '(\d+(?:[.,]\d+)?)\s*(?:մ|m)?\s*[x×*]\s*(\d+(?:[.,]\d+)?)'
    ) AS parts
  FROM "RegistrationRequest"
  WHERE "platformDimensions" IS NOT NULL
) AS src
WHERE r."id" = src."id" AND src.parts IS NOT NULL;

-- DropColumn — one representation from here on
ALTER TABLE "RegistrationRequest" DROP COLUMN "platformDimensions";
