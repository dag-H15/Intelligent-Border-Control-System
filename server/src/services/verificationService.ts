import prisma from "../config/prisma";
import { Decision } from "../../generated/prisma";
import { DEFAULT_THRESHOLD } from "../config/constants";
import { decideVerification } from "./decisionEngine";
import { compareBiometricTemplate, type CaptureMode } from "./aiClient";

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

  const systemDecision = decideVerification(scores.finalScore, threshold);

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
    },
  });

  return { verificationLog, traveler, ...scores };
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