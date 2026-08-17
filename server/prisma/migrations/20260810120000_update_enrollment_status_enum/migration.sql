-- Rename enrollment status enum values to support draft enrollment.
ALTER TYPE "EnrollmentStatus" RENAME VALUE 'PENDING' TO 'DRAFT';
ALTER TYPE "EnrollmentStatus" RENAME VALUE 'ENROLLED' TO 'COMPLETED';
