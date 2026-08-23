-- Extend audit_logs with structured fields so events can answer
-- WHO / WHAT / WHEN / WHICH RESOURCE / RESULT / SEVERITY / DETAILS.
-- Existing rows keep working: every new column is nullable.

ALTER TABLE "audit_logs" ADD COLUMN "resource_type" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "resource_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "result" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "description" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "metadata" JSONB;

CREATE INDEX "audit_logs_result_idx" ON "audit_logs"("result");
