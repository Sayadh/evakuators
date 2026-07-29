-- AlterTable: driver-facing "someone just took your number" Telegram notices.
-- Only the one-time-intro marker is stored; the notices themselves are not
-- opt-out, so there is no per-driver flag. NULL = the explanation has not been
-- delivered yet, which is true for every existing driver.
ALTER TABLE "TowTruck" ADD COLUMN "contactNoticeIntroAt" TIMESTAMP(3);
