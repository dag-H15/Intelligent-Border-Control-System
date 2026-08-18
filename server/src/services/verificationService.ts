import prisma from "../config/prisma";
import { Decision } from "../../generated/prisma";
import { DEFAULT_THRESHOLD } from "../config/constants";
import { decideVerification } from "./decisionEngine";
import { compareBiometricTemplate, type CaptureMode } from "./aiClient";

import { BorderDirection } from "../../generated/prisma";

interface RunVerificationInput {
  travelerId?: number;
  fan?: string;
  captureMode: CaptureMode;
  officerId: number;
  threshold?: number;
  fingerprintImage?: Buffer;
  irisImage?: Buffer;
  fingerprintData?: string;
  irisData?: string;
  direction?: BorderDirection;
  checkpointId?: number;
}

import { getSystemSettings } from "./settingsService";

export async function runVerification(input: RunVerificationInput) {
  let threshold = input.threshold;
  if (threshold === undefined) {
    const settings = await getSystemSettings();
    threshold = settings.approvalThreshold ?? DEFAULT_THRESHOLD;
  }

  let traveler = await prisma.traveler.findFirst({
    where: input.travelerId ? { id: input.travelerId } : { fan: input.fan },
    include: { biometric: true },
  });

  if (!traveler) {
    const error = new Error("Traveler not found");
    (error as any).statusCode = 404;
    throw error;
  }

  if (traveler.biometric && traveler.enrollmentStatus !== "COMPLETED") {
    traveler = await prisma.traveler.update({
      where: { id: traveler.id },
      data: { enrollmentStatus: "COMPLETED" },
      include: { biometric: true },
    });
  }

  if (!traveler.biometric || traveler.enrollmentStatus !== "COMPLETED") {
    const error = new Error("Traveler is not fully enrolled; no biometric templates on file");
    (error as any).statusCode = 409;
    throw error;
  }

  const fingerprintComparison = await compareBiometricTemplate({
    biometricType: "fingerprint",
    imageBuffer: input.fingerprintImage,
    imageData: input.fingerprintData,
    storedTemplate: traveler.biometric.fingerprintTemplate,
    threshold,
  });

  const irisComparison = await compareBiometricTemplate({
    biometricType: "iris",
    imageBuffer: input.irisImage,
    imageData: input.irisData,
    storedTemplate: traveler.biometric.irisTemplate,
    threshold,
  });

  const scores = {
    fingerprintScore: fingerprintComparison.score,
    irisScore: irisComparison.score,
    finalScore: Math.round(((fingerprintComparison.score + irisComparison.score) / 2) * 100) / 100,
  };

  let systemDecision: Decision = "VERIFIED";
  let decisionReason = "";

  if (traveler.alertStatus === "RESTRICTED") {
    systemDecision = "REJECTED";
    decisionReason = `Traveller is marked as restricted: ${traveler.alertReason || "No details specified"}`;
  } else if (traveler.alertStatus === "WARNING") {
    systemDecision = "PENDING_SUPERVISOR_REVIEW";
    decisionReason = `Traveller alert status is WARNING: ${traveler.alertReason || "Requires manual review"}`;
  } else {
    systemDecision = decideVerification(scores.finalScore, threshold);
  }

  const verificationLog = await prisma.verificationLog.create({
    data: {
      travelerId: traveler.id,
      officerId: input.officerId,
      fingerprintScore: scores.fingerprintScore,
      irisScore: scores.irisScore,
      finalScore: scores.finalScore,
      threshold,
      status: "COMPLETED",
      systemDecision,
      finalDecision: systemDecision,
      direction: input.direction || "ENTRY",
      checkpointId: input.checkpointId,
      decisionReason,
      alertStatusAtVerification: traveler.alertStatus,
      alertReasonAtVerification: traveler.alertReason,
    },
  });

  if (systemDecision === "PENDING_SUPERVISOR_REVIEW") {
    let reason = "THRESHOLD_BREACH";
    if (traveler.alertStatus === "WARNING") {
      reason = "ALERT_WARNING";
    }

    await prisma.manualReviewRequest.create({
      data: {
        travelerId: traveler.id,
        officerId: input.officerId,
        verificationId: verificationLog.id,
        reason: reason as any,
        officerNotes: decisionReason || "Automatic manual review trigger",
        status: "PENDING",
      },
    });

    const { notifyAllSupervisors } = require("./notificationService");
    await notifyAllSupervisors(
      "Pending Manual Review Request",
      `New review required for traveler ${traveler.fullName} (FAN: ${traveler.fan}) due to ${reason.replace(/_/g, " ")}.`,
      "WARNING"
    ).catch((err: any) => console.error("Failed to notify supervisors:", err));
  }

  return { verificationLog, traveler, ...scores };
}

export async function getDashboardStats() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const logs = await prisma.verificationLog.findMany({
    where: { timestamp: { gte: start, lte: end } },
    select: { finalDecision: true, direction: true }
  });

  const reviews = await prisma.manualReviewRequest.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { id: true }
  });

  return {
    todayCrossings: logs.length,
    todayEntries: logs.filter((l) => l.direction === "ENTRY").length,
    todayExits: logs.filter((l) => l.direction === "EXIT").length,
    todayAccepted: logs.filter((l) => l.finalDecision === "VERIFIED").length,
    todayRejected: logs.filter((l) => l.finalDecision === "REJECTED").length,
    todayReviews: reviews.length,
  };
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