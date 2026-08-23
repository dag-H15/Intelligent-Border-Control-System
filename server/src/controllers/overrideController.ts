import { Request, Response, NextFunction } from "express";
import { listPendingReview, decideOverride, getOverridesBySupervisor } from "../services/overrideService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel, Decision } from "../../generated/prisma";

const VALID_OVERRIDE_DECISIONS: Decision[] = ["VERIFIED", "REJECTED"];

/**
 * GET /api/override/pending
 * Lists all verification attempts awaiting supervisor review.
 */
export async function pending(req: Request, res: Response, next: NextFunction) {
  try {
    const logs = await listPendingReview();
    return res.status(200).json({ pendingVerifications: logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/override/my-activity
 * Supervisor's own override activity for dashboard cards.
 */
export async function myActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const overrides = await getOverridesBySupervisor(req.user!.userId);
    return res.status(200).json({ overrideRecords: overrides });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/override/:verificationId
 * Supervisor approves (VERIFIED) or rejects (REJECTED) a pending case.
 */
export async function decide(req: Request, res: Response, next: NextFunction) {
  try {
    const verificationId = Number(req.params.verificationId);
    const { decision, reason } = req.body;

    if (!Number.isInteger(verificationId)) {
      return res.status(400).json({ message: "verificationId must be a valid integer" });
    }

    if (!decision || !reason) {
      return res.status(400).json({ message: "decision and reason are required" });
    }

    if (!VALID_OVERRIDE_DECISIONS.includes(decision)) {
      return res.status(400).json({
        message: `decision must be one of: ${VALID_OVERRIDE_DECISIONS.join(", ")}`,
      });
    }

    const result = await decideOverride({
      verificationId,
      supervisorId: req.user!.userId,
      decision,
      reason,
    });

    await logAuditEvent({
      userId: req.user!.userId,
      action: decision === "VERIFIED" ? "Supervisor override approved" : "Supervisor override rejected",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: decision === "VERIFIED" ? AuditResult.VERIFIED : AuditResult.REJECTED,
      resourceType: "Verification",
      resourceId: String(verificationId),
      description: `Supervisor override on verification #${verificationId}: ${result.overrideRecord.previousDecision} → ${decision}. Reason: ${reason}`,
      metadata: {
        verificationId,
        travelerId: result.verificationLog.travelerId ?? null,
        previousDecision: result.overrideRecord.previousDecision,
        newDecision: decision,
        reason,
      },
    });

    return res.status(200).json(result);
  } catch (err) {
    if ((err as any)?.statusCode === 404 || (err as any)?.statusCode === 409) {
      await logAuditEvent({
        userId: req.user!.userId,
        action: "Invalid override attempt",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "Verification",
        resourceId: String(req.params.verificationId ?? ""),
        description: `Override rejected for verification #${req.params.verificationId}: ${(err as Error).message}`,
      });
    }
    next(err);
  }
}