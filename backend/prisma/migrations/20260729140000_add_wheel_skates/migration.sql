-- AlterTable: "wheel skates" equipment flag — same shape as winch/manipulator.
ALTER TABLE "TowTruck" ADD COLUMN "wheelSkates" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RegistrationRequest" ADD COLUMN "wheelSkates" BOOLEAN NOT NULL DEFAULT false;
