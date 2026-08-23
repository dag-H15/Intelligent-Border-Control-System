import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { runVerification, getVerificationsByOfficer, getDashboardStats } from "../services/verificationService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";
import { checkBiometricQuality } from "../services/aiClient";
import {
  isValidFingerprintFormat,
  isValidIrisFormat,
  isMockOrSeededFingerprint,
  isMockOrSeededIris
} from "../utils/fileValidation";

const upload = multer({ storage: multer.memoryStorage() });

export const verificationUpload = upload.fields([
  { name: "fingerprintImage", maxCount: 1 },
  { name: "irisImage", maxCount: 1 },
]);

/**
 * POST /api/verification
 * Officer captures fingerprint/iris again; scores are compared against
 * the enrolled templates (via the AI service, once wired in) and a
 * decision is recorded.
 */
export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const { travelerId, fan, captureMode = "SIMULATION", fingerprintImage, irisImage, fingerprintData, irisData, threshold, direction, checkpointId } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const fingerprintBuffer = files?.fingerprintImage?.[0]?.buffer;
    const irisBuffer = files?.irisImage?.[0]?.buffer;
    const fingerprintSource = fingerprintImage ? String(fingerprintImage) : fingerprintData ? String(fingerprintData) : undefined;
    const irisSource = irisImage ? String(irisImage) : irisData ? String(irisData) : undefined;

    if (!travelerId && !fan) {
      await logAuditEvent({
        userId: req.user!.userId,
        action: "Invalid verification request",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "Verification",
        description: "Verification rejected — traveler reference missing",
      });
      return res.status(400).json({ message: "travelerId or fan is required" });
    }

    if (captureMode === "SIMULATION") {
      if (!fingerprintBuffer && !fingerprintSource) {
        return res.status(400).json({ message: "fingerprintImage is required for simulation mode" });
      }
      const fpInput = fingerprintBuffer || fingerprintSource;
      if (fpInput && !isMockOrSeededFingerprint(fpInput) && !isValidFingerprintFormat(fpInput)) {
        await logAuditEvent({
          userId: req.user!.userId,
          action: "Invalid verification request",
          ipAddress: getClientIp(req),
          severity: AuditLevel.WARNING,
          result: AuditResult.FAILED,
          resourceType: "Verification",
          resourceId: travelerId ? String(travelerId) : fan ? String(fan) : null,
          description: `Verification rejected — invalid fingerprint image format for traveler ${travelerId || fan}`,
        });
        return res.status(400).json({
          message: "Invalid fingerprint image format. Accepted formats: PNG, JPG, JPEG, BMP, TIF, TIFF",
        });
      }

      if (!irisBuffer && !irisSource) {
        return res.status(400).json({ message: "irisImage is required for simulation mode" });
      }
      const irisInput = irisBuffer || irisSource;
      if (irisInput && !isMockOrSeededIris(irisInput) && !isValidIrisFormat(irisInput)) {
        await logAuditEvent({
          userId: req.user!.userId,
          action: "Invalid verification request",
          ipAddress: getClientIp(req),
          severity: AuditLevel.WARNING,
          result: AuditResult.FAILED,
          resourceType: "Verification",
          resourceId: travelerId ? String(travelerId) : fan ? String(fan) : null,
          description: `Verification rejected — invalid iris image format for traveler ${travelerId || fan}`,
        });
        return res.status(400).json({
          message: "Invalid iris image format. Accepted formats: PNG, JPG, JPEG, BMP",
        });
      }
    }

    if (captureMode === "SCANNER" && !fingerprintSource) {
      return res.status(400).json({ message: "fingerprintData is required for scanner mode" });
    }

    if (captureMode === "SCANNER" && !irisSource) {
      return res.status(400).json({ message: "irisData is required for scanner mode" });
    }

    const result = await runVerification({
      travelerId: travelerId ? Number(travelerId) : undefined,
      fan: fan ? String(fan) : undefined,
      captureMode,
      threshold: threshold !== undefined ? Number(threshold) : undefined,
      officerId: req.user!.userId,
      fingerprintImage: fingerprintBuffer,
      irisImage: irisBuffer,
      fingerprintData: fingerprintSource,
      irisData: irisSource,
      direction: direction ? String(direction) as any : undefined,
      checkpointId: checkpointId ? Number(checkpointId) : undefined,
    });

    // Severity matrix:
    //  - CRITICAL watchlist encounter          → CRITICAL
    //  - rejected or routed to manual review   → WARNING
    //  - clean verification                    → INFO
    const decision = result.verificationLog.systemDecision;
    const alertAtVerification = result.traveler.alertStatus;
    let severity: AuditLevel = AuditLevel.INFO;
    if (alertAtVerification === "CRITICAL") {
      severity = AuditLevel.CRITICAL;
    } else if (
      decision === "REJECTED" ||
      decision === "PENDING_SUPERVISOR_REVIEW" ||
      alertAtVerification === "WARNING"
    ) {
      severity = AuditLevel.WARNING;
    }

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Verification completed",
      ipAddress: getClientIp(req),
      severity,
      result: decision ?? undefined,
      resourceType: "Verification",
      resourceId: result.verificationLog.id,
      description: `Verification for FAN ${result.traveler.fan} (${result.traveler.fullName}) — system decision: ${decision}. ${result.decisionReason}`,
      metadata: {
        fan: result.traveler.fan,
        travelerId: result.traveler.id,
        fingerprintScore: result.verificationLog.fingerprintScore,
        irisScore: result.verificationLog.irisScore,
        finalScore: result.verificationLog.finalScore,
        threshold: result.verificationLog.threshold,
        direction: result.verificationLog.direction ?? "ENTRY",
        checkpointId: result.verificationLog.checkpointId ?? null,
        alertStatus: alertAtVerification ?? "NONE",
        reason: result.decisionReason,
      },
    });

    return res.status(201).json({
      verificationLog: result.verificationLog,
      traveler: {
        id: result.traveler.id,
        fan: result.traveler.fan,
        fullName: result.traveler.fullName,
        dateOfBirth: result.traveler.dateOfBirth.toISOString().slice(0, 10),
        gender: result.traveler.gender,
        nationality: result.traveler.nationality,
        photo: result.traveler.photo,
        enrollmentStatus: result.traveler.enrollmentStatus,
        alertStatus: result.traveler.alertStatus,
        alertReason: result.traveler.alertReason,
      },
      decisionReason: result.decisionReason,
    });
  } catch (err) {
    if ((err as any)?.statusCode === 404 || (err as any)?.statusCode === 409) {
      await logAuditEvent({
        userId: req.user!.userId,
        action: "Invalid verification attempt",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "Verification",
        resourceId: req.body.travelerId ? String(req.body.travelerId) : req.body.fan ? String(req.body.fan) : null,
        description: `Verification failed for FAN ${req.body.fan || req.body.travelerId}: ${(err as Error).message}`,
      });
    }
    next(err);
  }
}

/**
 * GET /api/verification/my-activity
 * An officer's own verification history.
 */
export async function myActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await getVerificationsByOfficer(req.user!.userId);
    return res.status(200).json({ verificationLogs: logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/verification/stats
 * Dashboard statistics from PostgreSQL.
 */
export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getDashboardStats();
    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/verification/quality
 * Evaluates the capture quality of a fingerprint or iris scan.
 */
export async function qualityCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const { biometricType, image, imageData } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    
    const fileBuffer = files?.[biometricType === "iris" ? "irisImage" : "fingerprintImage"]?.[0]?.buffer;
    const sourceData = fileBuffer || image || imageData;

    if (!sourceData) {
      return res.status(400).json({ message: "Image data is required" });
    }

    const result = await checkBiometricQuality({
      biometricType: biometricType as any,
      imageBuffer: Buffer.isBuffer(sourceData) ? sourceData : undefined,
      imageData: typeof sourceData === "string" ? sourceData : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}