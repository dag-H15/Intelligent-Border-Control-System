import prisma from "../config/prisma";
import { Decision } from "../../generated/prisma";
import { DEFAULT_THRESHOLD, REVIEW_MARGIN } from "../config/constants";
import { decideVerification } from "./decisionEngine";
import { compareBiometricTemplate, type CaptureMode } from "./aiClient";
import { getSystemSettings } from "./settingsService";
import { notifyAllSupervisors } from "./notificationService";
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

export async function runVerification(input: RunVerificationInput) {
  // 1. Resolve threshold from admin settings if not explicitly supplied
  let threshold = input.threshold;
  if (threshold === undefined) {
    const settings = await getSystemSettings();
    threshold = settings.approvalThreshold ?? DEFAULT_THRESHOLD;
  }

  // 2. Fetch traveler with biometrics
  let traveler = await prisma.traveler.findFirst({
    where: input.travelerId ? { id: input.travelerId } : { fan: input.fan },
    include: { biometric: true },
  });

  if (!traveler) {
    const error = new Error("Traveler not found");
    (error as any).statusCode = 404;
    throw error;
  }

  // Auto-fix stale enrollment status
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

  // 3. Biometric comparison
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
    finalScore:
      Math.round(((fingerprintComparison.score + irisComparison.score) / 2) * 100) / 100,
  };

  // 4. Decision logic - Implement correct alert status matrix
  // Priority: CRITICAL > WARNING+biometric check > biometric threshold
  // Snapshot the current alert status so history is immutable even if it changes later.
  const alertAtVerification = traveler.alertStatus;
  const alertReasonAtVerification = traveler.alertReason;

  let systemDecision: Decision;
  let decisionReason = "";
  let manualReviewReason: "THRESHOLD_BREACH" | "ALERT_WARNING" | null = null;

  // Check if biometrics passed the threshold
  const biometricPassed = scores.finalScore >= threshold;

  if (alertAtVerification === "CRITICAL") {
    // CRITICAL: ALWAYS BLOCK/REJECT regardless of biometric result
    systemDecision = "REJECTED";
    decisionReason = `Traveler has a CRITICAL alert status. Border crossing is not permitted. ${alertReasonAtVerification ?? ""}`.trim();
    // No manual review for CRITICAL - it's a hard block
    manualReviewReason = null;
  } else if (alertAtVerification === "WARNING") {
    // WARNING logic depends on biometric result
    if (biometricPassed) {
      // WARNING + BIOMETRIC PASS → Supervisor review
      systemDecision = "PENDING_SUPERVISOR_REVIEW";
      decisionReason = `Biometric verification passed (${scores.finalScore}% ≥ ${threshold}%), but traveler has a WARNING status requiring supervisor review. ${alertReasonAtVerification ?? ""}`.trim();
      manualReviewReason = "ALERT_WARNING";
    } else {
      // WARNING + BIOMETRIC FAIL → REJECT (do NOT send to supervisor just because of WARNING)
      systemDecision = "REJECTED";
      decisionReason = `Biometric verification failed (${scores.finalScore}% < ${threshold}%). Match score is below the configured threshold.`;
      // No manual review - biometric mismatch takes precedence
      manualReviewReason = null;
    }
  } else {
    // NONE: Normal biometric-based decision
    systemDecision = decideVerification(scores.finalScore, threshold);
    if (systemDecision === "PENDING_SUPERVISOR_REVIEW") {
      decisionReason = `Biometric confidence score (${scores.finalScore}%) is within the supervisor review range (${threshold - REVIEW_MARGIN}%-${threshold - 1}%).`;
      manualReviewReason = "THRESHOLD_BREACH";
    } else if (systemDecision === "REJECTED") {
      decisionReason = `Biometric confidence score (${scores.finalScore}%) is below the acceptance threshold (${threshold}%).`;
    } else {
      decisionReason = `Biometric confidence score (${scores.finalScore}%) meets the acceptance threshold (${threshold}%).`;
    }
  }

  // 5. Persist verification log with historical snapshot of alert status
  console.log(
    `[verification] traveler=${traveler.id} alert=${alertAtVerification} fp=${scores.fingerprintScore} iris=${scores.irisScore} final=${scores.finalScore} threshold=${threshold} biometricPassed=${biometricPassed} -> ${systemDecision} (manualReviewReason=${manualReviewReason ?? "NONE"})`
  );

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
      direction: input.direction ?? "ENTRY",
      checkpointId: input.checkpointId ?? null,
      decisionReason,
      alertStatusAtVerification: alertAtVerification,
      alertReasonAtVerification: alertReasonAtVerification,
    },
  });

  // 6. Auto-create ManualReviewRequest ONLY for:
  //    - WARNING + biometric PASS
  //    - Biometric score in review range (NONE alert status)
  // Do NOT create for:
  //    - CRITICAL (hard block)
  //    - WARNING + biometric FAIL (rejected due to mismatch)
  if (systemDecision === "PENDING_SUPERVISOR_REVIEW" && manualReviewReason) {
    await prisma.manualReviewRequest.create({
      data: {
        travelerId: traveler.id,
        officerId: input.officerId,
        verificationId: verificationLog.id,
        reason: manualReviewReason as any,
        officerNotes: decisionReason,
        status: "PENDING",
      },
    });

    // 7. Notify all supervisors — include alert status context when relevant
    const alertLabel =
      alertAtVerification === "WARNING"
        ? ` [Watchlist: ${alertAtVerification}]`
        : "";
    await notifyAllSupervisors(
      "Manual Review Required",
      `New review for ${traveler.fullName} (FAN: ${traveler.fan})${alertLabel}. Reason: ${decisionReason}`,
      alertAtVerification === "WARNING" ? "WARNING" : "INFO"
    ).catch((err) => console.error("Failed to notify supervisors:", err));
  }

  return { verificationLog, traveler, ...scores, decisionReason };
}

/** Today's border-crossing dashboard statistics */
export async function getDashboardStats() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const logs = await prisma.verificationLog.findMany({
    where: { timestamp: { gte: start, lte: end } },
    select: { finalDecision: true, direction: true },
  });

  const reviews = await prisma.manualReviewRequest.findMany({
    where: { createdAt: { gte: start, lte: end } },
    select: { id: true },
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

/** Officer's own verification history with full context */
export async function getVerificationsByOfficer(officerId: number) {
  return prisma.verificationLog.findMany({
    where: { officerId },
    orderBy: { timestamp: "desc" },
    include: {
      traveler:   { select: { fan: true, fullName: true } },
      checkpoint: { select: { id: true, name: true } },
    },
  });
}

/** All verification logs currently awaiting supervisor review */
export async function getPendingReview() {
  return prisma.verificationLog.findMany({
    where: { finalDecision: "PENDING_SUPERVISOR_REVIEW" },
    orderBy: { timestamp: "asc" },
    include: {
      traveler:   { select: { fan: true, fullName: true } },
      officer:    { select: { id: true, name: true } },
      checkpoint: { select: { id: true, name: true } },
    },
  });
}
