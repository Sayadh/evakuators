-- AlterTable
-- Drivers log in with phone + password instead of a Telegram code.
--
-- `passwordHash` is NULLABLE with no DEFAULT, so this rewrites no existing row
-- and cannot fail on existing data. Every driver approved before this feature
-- starts with NULL, which correctly means "cannot log in yet": there is no
-- password to guess and no default to leak. They get one the next time they tap
-- a Telegram link, which is also the only channel we have for delivering it —
-- see TelegramWebhookController.handleStart. For drivers already linked, an
-- admin re-issues that link from /admin ("Փոխել Telegram"), the driver taps it,
-- and the password arrives in the same message. No backfill, no shared
-- transitional secret.
ALTER TABLE "TowTruck" ADD COLUMN "passwordHash" TEXT;

-- AlterTable
-- True exactly while `passwordHash` holds a password WE generated. DEFAULT
-- false is right for every pre-existing row: they hold no password at all, so
-- they are certainly not holding a temporary one.
ALTER TABLE "TowTruck" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
-- Driver login codes have no remaining reader: the request-code/verify-code
-- endpoints are gone with this change. Dropped rather than left behind, because
-- a live table of credential hashes that nothing writes and nothing checks is
-- the kind of thing that quietly outlives the memory of why it is empty.
--
-- Nothing depends on it — the only FK pointed FROM DriverOtp TO TowTruck
-- (ON DELETE CASCADE), never the other way, so this drops the constraint with
-- the table and leaves "TowTruck" untouched.
--
-- Not reversible: the rows are one-way SHA-256 hashes of six-digit codes that
-- expired within five minutes of being issued, so there is nothing here to keep
-- for audit or rollback purposes either.
DROP TABLE "DriverOtp";
