import { Request, Response, NextFunction } from "express";
import { runVerification, getVerificationsByOfficer } from "../services/verificationService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

/**
 * POST /api/verification
 * Officer captures fingerprint/iris again; scores are compared against
 * the enrolled templates (via the AI service, once wired in) and a
 * decision is recorded.
 */
export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const { fan, fingerprintScore, irisScore, threshold } = req.body;

    if (!fan || fingerprintScore === undefined || irisScore === undefined) {
      await createAuditLog(
        req.user!.userId,
        `Invalid verification request for FAN ${fan || "unknown"}: missing required fields`,
        getClientIp(req),
        AuditLevel.WARNING
      );
      return res.status(400).json({
        message: "fan, fingerprintScore, and irisScore are required",
      });
    }

    if (
      typeof fingerprintScore !== "number" ||
      typeof irisScore !== "number" ||
      fingerprintScore < 0 ||
      fingerprintScore > 100 ||
      irisScore < 0 ||
      irisScore > 100
    ) {
      await createAuditLog(
        req.user!.userId,
        `Invalid verification request for FAN ${fan}: score validation failed`,
        getClientIp(req),
        AuditLevel.WARNING
      );
      return res.status(400).json({ message: "Scores must be numbers between 0 and 100" });
    }

    const { verificationLog } = await runVerification({
      fan,
      fingerprintScore,
      irisScore,
      threshold,
      officerId: req.user!.userId,
    });

    await createAuditLog(
      req.user!.userId,
      `Verification attempt for FAN ${fan} -> ${verificationLog.systemDecision}`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json({ verificationLog });
  } catch (err) {
    if ((err as any)?.statusCode === 404 || (err as any)?.statusCode === 409) {
      await createAuditLog(
        req.user!.userId,
        `Invalid verification attempt for FAN ${req.body.fan}: ${(err as Error).message}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
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