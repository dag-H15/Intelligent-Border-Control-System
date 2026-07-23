-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OFFICER', 'SUPERVISOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "Decision" AS ENUM ('VERIFIED', 'PENDING_SUPERVISOR_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('VERIFICATION_SUMMARY', 'OVERRIDE_SUMMARY', 'OFFICER_ACTIVITY');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ENROLLED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travelers" (
    "id" SERIAL NOT NULL,
    "fan" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "nationality" TEXT NOT NULL,
    "photo" TEXT,
    "enrollment_status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "enrollment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travelers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biometrics" (
    "id" SERIAL NOT NULL,
    "traveler_id" INTEGER NOT NULL,
    "fingerprint_template" BYTEA NOT NULL,
    "iris_template" BYTEA NOT NULL,
    "captured_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "biometrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_logs" (
    "id" SERIAL NOT NULL,
    "traveler_id" INTEGER NOT NULL,
    "officer_id" INTEGER NOT NULL,
    "fingerprint_score" DOUBLE PRECISION NOT NULL,
    "iris_score" DOUBLE PRECISION NOT NULL,
    "final_score" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "system_decision" "Decision",
    "final_decision" "Decision",
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override_records" (
    "id" SERIAL NOT NULL,
    "verification_id" INTEGER NOT NULL,
    "supervisor_id" INTEGER NOT NULL,
    "previous_decision" "Decision" NOT NULL,
    "new_decision" "Decision" NOT NULL,
    "reason" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "override_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" SERIAL NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "generated_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "travelers_fan_key" ON "travelers"("fan");

-- CreateIndex
CREATE UNIQUE INDEX "biometrics_traveler_id_key" ON "biometrics"("traveler_id");

-- CreateIndex
CREATE INDEX "biometrics_captured_by_idx" ON "biometrics"("captured_by");

-- CreateIndex
CREATE INDEX "verification_logs_traveler_id_idx" ON "verification_logs"("traveler_id");

-- CreateIndex
CREATE INDEX "verification_logs_officer_id_idx" ON "verification_logs"("officer_id");

-- CreateIndex
CREATE INDEX "verification_logs_system_decision_idx" ON "verification_logs"("system_decision");

-- CreateIndex
CREATE UNIQUE INDEX "override_records_verification_id_key" ON "override_records"("verification_id");

-- CreateIndex
CREATE INDEX "override_records_supervisor_id_idx" ON "override_records"("supervisor_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "reports_generated_by_idx" ON "reports"("generated_by");

-- AddForeignKey
ALTER TABLE "biometrics" ADD CONSTRAINT "biometrics_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "travelers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biometrics" ADD CONSTRAINT "biometrics_captured_by_fkey" FOREIGN KEY ("captured_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_traveler_id_fkey" FOREIGN KEY ("traveler_id") REFERENCES "travelers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_logs" ADD CONSTRAINT "verification_logs_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_records" ADD CONSTRAINT "override_records_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "verification_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_records" ADD CONSTRAINT "override_records_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
