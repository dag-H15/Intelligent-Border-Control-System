import prisma from "../config/prisma";
import { Decision } from "../../generated/prisma";
import { DEFAULT_THRESHOLD, REVIEW_MARGIN } from "../config/constants";

interface RunVerificationInput {
  fan: string;
  fingerprintScore: number;
  irisScore: number;
  threshold?: number;
  officerId: number;
}

/**
 * Decision engine: given the AI-returned fingerprint/iris scores and a
 * threshold, decides VERIFIED / PENDING_SUPERVISOR_REVIEW / REJECTED.
 *
 *   finalScore >= threshold                          -> VERIFIED
 *   threshold - REVIEW_MARGIN <= finalScore < threshold -> PENDING_SUPERVISOR_REVIEW
 *   finalScore < threshold - REVIEW_MARGIN            -> REJECTED
 */
function decide(finalScore: number, threshold: number): Decision {
  if (finalScore >= threshold) return "VERIFIED";
  if (finalScore >= threshold - REVIEW_MARGIN) return "PENDING_SUPERVISOR_REVIEW";
  return "REJECTED";
}

/**
 * Runs a verification attempt for an enrolled traveler.
 *
 * NOTE: fingerprintScore/irisScore are expected here as already-computed
 * match scores. Today the officer's client (or a stub) supplies them;
 * once the FastAPI AI service is wired in, this is where its response
 * would be consumed instead.
 */
export async function runVerification(input: RunVerificationInput) {
  const { fan, fingerprintScore, irisScore, officerId } = input;
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;

  const traveler = await prisma.traveler.findUnique({
    where: { fan },
    include: { biometric: true },
  });

  if (!traveler) {
    const error = new Error("No traveler found for this FAN");
    (error as any).statusCode = 404;
    throw error;
  }

  if (!traveler.biometric || traveler.enrollmentStatus !== "ENROLLED") {
    const error = new Error("Traveler is not fully enrolled; no biometric templates on file");
    (error as any).statusCode = 409;
    throw error;
  }

  const finalScore = (fingerprintScore + irisScore) / 2;
  const systemDecision = decide(finalScore, threshold);

  const verificationLog = await prisma.verificationLog.create({
    data: {
      travelerId: traveler.id,
      officerId,
      fingerprintScore,
      irisScore,
      finalScore,
      threshold,
      status: "COMPLETED", // AI/decision step finished; a supervisor may still act on the decision
      systemDecision,
      finalDecision: systemDecision, // may later be changed via OverrideRecord
    },
  });

  return { verificationLog, traveler };
}

/**
 * An officer's own verification history ("View their own verification activities").
 */
export async function getVerificationsByOfficer(officerId: number) {
  return prisma.verificationLog.findMany({
    where: { officerId },
    orderBy: { timestamp: "desc" },
    include: { traveler: { select: { fan: true, fullName: true } } },
  });
}

/**
 * All verification logs currently awaiting supervisor review.
 * Used by the override module (Phase 6).
 */
export async function getPendingReview() {
  return prisma.verificationLog.findMany({
    where: { finalDecision: "PENDING_SUPERVISOR_REVIEW" },
    orderBy: { timestamp: "asc" },
    include: {
      traveler: { select: { fan: true, fullName: true } },
      officer: { select: { id: true, name: true } },
    },
  });
}