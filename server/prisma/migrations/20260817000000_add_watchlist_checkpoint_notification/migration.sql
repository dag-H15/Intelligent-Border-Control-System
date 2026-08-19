-- =============================================================
-- Migration: add_watchlist_checkpoint_notification
-- Covers all schema additions since 20260810121000:
--   • AlertStatus enum (NONE/WARNING/CRITICAL)
--   • BorderDirection enum (ENTRY/EXIT)
--   • Traveler alert fields
--   • VerificationLog new columns (direction, checkpoint, alert snapshot, decisionReason)
--   • Checkpoint table
--   • Notification table
--   • ManualReviewReason new values
--   • Audit log user_id made nullable
-- =============================================================

-- 1. AlertStatus enum
DO $$ BEGIN
  CREATE TYPE "AlertStatus" AS ENUM ('NONE', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN
  -- Already exists; add CRITICAL if RESTRICTED was used
  BEGIN
    ALTER TYPE "AlertStatus" ADD VALUE IF NOT EXISTS 'CRITICAL';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- Rename RESTRICTED -> CRITICAL if RESTRICTED exists
DO $$ BEGIN
  ALTER TYPE "AlertStatus" RENAME VALUE 'RESTRICTED' TO 'CRITICAL';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;

-- 2. BorderDirection enum
DO $$ BEGIN
  CREATE TYPE "BorderDirection" AS ENUM ('ENTRY', 'EXIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Add alert columns to travelers (idempotent via IF NOT EXISTS)
ALTER TABLE "travelers"
  ADD COLUMN IF NOT EXISTS "alert_status"  "AlertStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "alert_reason"  TEXT;

-- 4. Checkpoint table
CREATE TABLE IF NOT EXISTS "checkpoints" (
  "id"         SERIAL        NOT NULL,
  "name"       TEXT          NOT NULL,
  "location"   TEXT,
  "is_active"  BOOLEAN       NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkpoints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "checkpoints_name_key" ON "checkpoints"("name");

-- 5. New columns on verification_logs
ALTER TABLE "verification_logs"
  ADD COLUMN IF NOT EXISTS "direction"                     "BorderDirection" DEFAULT 'ENTRY',
  ADD COLUMN IF NOT EXISTS "checkpoint_id"                 INTEGER,
  ADD COLUMN IF NOT EXISTS "decision_reason"               TEXT,
  ADD COLUMN IF NOT EXISTS "alert_status_at_verification"  "AlertStatus",
  ADD COLUMN IF NOT EXISTS "alert_reason_at_verification"  TEXT;

-- FK: verification_logs -> checkpoints (only add if not already there)
DO $$ BEGIN
  ALTER TABLE "verification_logs"
    ADD CONSTRAINT "verification_logs_checkpoint_id_fkey"
    FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoints"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Notification table
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"         SERIAL        NOT NULL,
  "user_id"    INTEGER       NOT NULL,
  "title"      TEXT          NOT NULL,
  "message"    TEXT          NOT NULL,
  "type"       TEXT          NOT NULL DEFAULT 'INFO',
  "is_read"    BOOLEAN       NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx"  ON "notifications"("user_id");
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx"  ON "notifications"("is_read");

DO $$ BEGIN
  ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. ManualReviewReason: add new values (IF NOT EXISTS guard)
DO $$ BEGIN
  ALTER TYPE "ManualReviewReason" ADD VALUE IF NOT EXISTS 'THRESHOLD_BREACH';
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "ManualReviewReason" ADD VALUE IF NOT EXISTS 'ALERT_WARNING';
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "ManualReviewReason" ADD VALUE IF NOT EXISTS 'QUALITY_ISSUE';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 8. Make audit_logs.user_id nullable (was NOT NULL in init migration)
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;

-- Add index on audit_logs.level if it doesn't exist
CREATE INDEX IF NOT EXISTS "audit_logs_level_idx" ON "audit_logs"("level");

-- 9. Users: add notifications relation index (column already added by earlier migration)
-- (failed_attempts and locked_until were added in 20260810112008)
