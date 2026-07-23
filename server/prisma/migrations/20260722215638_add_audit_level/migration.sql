-- CreateEnum
CREATE TYPE "AuditLevel" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "level" "AuditLevel" NOT NULL DEFAULT 'INFO',
ALTER COLUMN "user_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "audit_logs_level_idx" ON "audit_logs"("level");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
