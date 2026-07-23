import { Request, Response, NextFunction } from "express";
import { listPendingReview, decideOverride } from "../services/overrideService";
import { createAuditLog, getClientIp } from "../services/auditService";
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

    await createAuditLog(
      req.user!.userId,
      `Override on verification #${verificationId} -> ${decision} (reason: ${reason})`,
      getClientIp(req),
      AuditLevel.WARNING
    );

    return res.status(200).json(result);
  } catch (err) {
    if ((err as any)?.statusCode === 404 || (err as any)?.statusCode === 409) {
      await createAuditLog(
        req.user!.userId,
        `Invalid override attempt for verification #${req.params.verificationId}: ${(err as Error).message}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
    }
    next(err);
  }
}