-- AlterEnum
ALTER TYPE "ReportType" ADD VALUE 'MANUAL_REVIEW_SUMMARY';

-- AlterTable
ALTER TABLE "travelers" ALTER COLUMN "enrollment_status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
