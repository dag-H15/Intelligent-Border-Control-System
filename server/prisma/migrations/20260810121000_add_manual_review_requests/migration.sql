-- CreateEnum
CREATE TYPE "ManualReviewReason" AS ENUM ('FINGERPRINT_INJURY', 'IRIS_INJURY', 'BIOMETRIC_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ManualReviewDecision" AS ENUM ('APPROVED_OVERRIDE', 'REJECTED', 'REQUEST_RE_ENROLLMENT');

-- CreateEnum
CREATE TYPE "ManualReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RE_ENROLLMENT_REQUESTED');

-- CreateTable
CREATE TABLE "manual_review_requests" (
    "id" SERIAL NOT NULL,
    "traveler_id" INTEGER NOT NULL,
    "officer_id" INTEGER NOT NULL,
    "verification_id" INTEGER,
    "reason" "ManualReviewReason" NOT NULL,
    "officer_notes" TEXT NOT NULL,
    "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "decision" "ManualReviewDecision",
    "status" "ManualReviewStatus" NOT NULL DEFAULT 'PENDING',
    "supervisor_id" INTEGER,
    "supervisor_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "manual_review_requests_verification_id_key" ON "manual_review_requests"("verification_id");

-- CreateIndex
CREATE INDEX "manual_review_requests_traveler_id_idx" ON "manual_review_requests"("traveler_id");

-- CreateIndex
CREATE INDEX "manual_review_requests_officer_id_idx" ON "manual_review_requests"("officer_id");

-- CreateIndex
CREATE INDEX "manual_review_requests_supervisor_id_idx" ON "manual_review_requests"("supervisor_id");

-- CreateIndex
CREATE INDEX "manual_review_requests_status_idx" ON "manual_review_requests"("status");

-- AddForeignKey
ALTER TABLE "manual_review_requests" ADD CONSTRAINT "manual_review_requests_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "travelers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_review_requests" ADD CONSTRAINT "manual_review_requests_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_review_requests" ADD CONSTRAINT "manual_review_requests_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_review_requests" ADD CONSTRAINT "manual_review_requests_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verification_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
