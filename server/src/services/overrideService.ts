import prisma from "../config/prisma";
import { Decision } from "../../generated/prisma";
import { getPendingReview } from "./verificationService";

interface DecideOverrideInput {
  verificationId: number;
  supervisorId: number;
  decision: Extract<Decision, "VERIFIED" | "REJECTED">;
  reason: string;
}

/** All verification logs currently awaiting supervisor review. */
export async function listPendingReview() {
  return getPendingReview();
}

/**
 * Supervisor approves or rejects a verification that the system flagged
 * as PENDING_SUPERVISOR_REVIEW. Writes an OverrideRecord and updates the
 * VerificationLog's finalDecision — systemDecision is left untouched as
 * the original AI/threshold outcome for audit purposes.
 */
export async function decideOverride(input: DecideOverrideInput) {
  const { verificationId, supervisorId, decision, reason } = input;

  const verificationLog = await prisma.verificationLog.findUnique({
    where: { id: verificationId },
  });

  if (!verificationLog) {
    const error = new Error("Verification log not found");
    (error as any).statusCode = 404;
    throw error;
  }

  if (verificationLog.finalDecision !== "PENDING_SUPERVISOR_REVIEW") {
    const error = new Error("This verification is not awaiting supervisor review");
    (error as any).statusCode = 409;
    throw error;
  }

  const existingOverride = await prisma.overrideRecord.findUnique({
    where: { verificationId },
  });
  if (existingOverride) {
    const error = new Error("This verification has already been overridden");
    (error as any).statusCode = 409;
    throw error;
  }

  const overrideRecord = await prisma.overrideRecord.create({
    data: {
      verificationId,
      supervisorId,
      previousDecision: verificationLog.finalDecision,
      newDecision: decision,
      reason,
    },
  });

  const updatedLog = await prisma.verificationLog.update({
    where: { id: verificationId },
    data: { finalDecision: decision },
  });

  return { overrideRecord, verificationLog: updatedLog };
}