import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AuditLevel, ManualReviewDecision, ManualReviewReason } from "../../generated/prisma";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { createManualReviewRequest, decideManualReview, listPendingManualReviews, getManualReviewHistory } from "../services/manualReviewService";

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 10 * 1024 * 1024 } });

export const manualReviewUpload = upload.array("attachments", 5);

const VALID_REASONS: ManualReviewReason[] = ["FINGERPRINT_INJURY", "IRIS_INJURY", "BIOMETRIC_UNAVAILABLE"];
// Re-enrollment is intentionally NOT offered as a supervisor decision.
const VALID_DECISIONS: ManualReviewDecision[] = ["APPROVED_OVERRIDE", "REJECTED"];

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { travelerId, verificationId, reason, officerNotes } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!travelerId || !reason || !officerNotes) {
      return res.status(400).json({ message: "travelerId, reason, and officerNotes are required" });
    }

    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ message: `reason must be one of: ${VALID_REASONS.join(", ")}` });
    }

    const request = await createManualReviewRequest({
      travelerId: Number(travelerId),
      officerId: req.user!.userId,
      verificationId: verificationId ? Number(verificationId) : undefined,
      reason,
      officerNotes,
      files,
    });

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Manual review created",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: AuditResult.PENDING,
      resourceType: "ManualReviewRequest",
      resourceId: String(request.id),
      description: `Manual review requested for ${request.traveler.fullName} (FAN ${request.traveler.fan}) — reason: ${reason}${request.verificationId ? `, verification #${request.verificationId}` : ""}`,
      metadata: {
        travelerId: request.travelerId,
        fan: request.traveler.fan,
        reason,
        officerNotes,
        verificationId: request.verificationId ?? null,
      },
    });

    return res.status(201).json({ manualReviewRequest: request });
  } catch (err) {
    next(err);
  }
}

export async function pending(req: Request, res: Response, next: NextFunction) {
  try {
    const requests = await listPendingManualReviews();
    return res.status(200).json({ manualReviewRequests: requests });
  } catch (err) {
    next(err);
  }
}

export async function decide(req: Request, res: Response, next: NextFunction) {
  try {
    const requestId = Number(req.params.requestId);
    const { decision, notes } = req.body;

    if (!Number.isInteger(requestId)) {
      return res.status(400).json({ message: "requestId must be a valid integer" });
    }

    if (!decision || !notes) {
      return res.status(400).json({ message: "decision and notes are required" });
    }

    if (!VALID_DECISIONS.includes(decision)) {
      return res.status(400).json({ message: `decision must be one of: ${VALID_DECISIONS.join(", ")}` });
    }

    const request = await decideManualReview({
      requestId,
      supervisorId: req.user!.userId,
      decision,
      notes,
    });

    const severity =
      decision === "APPROVED_OVERRIDE"
        ? AuditLevel.INFO
        : AuditLevel.WARNING;

    const result =
      decision === "APPROVED_OVERRIDE"
        ? AuditResult.APPROVED
        : decision === "REJECTED"
          ? AuditResult.REJECTED
          : AuditResult.SUCCESS;

    await logAuditEvent({
      userId: req.user!.userId,
      action:
        decision === "APPROVED_OVERRIDE"
          ? "Manual review approved"
          : decision === "REJECTED"
            ? "Manual review rejected"
            : "Re-enrollment requested",
      ipAddress: getClientIp(req),
      severity,
      result,
      resourceType: "ManualReviewRequest",
      resourceId: String(request.id),
      description: `Supervisor ${decision} manual review #${request.id} for ${request.traveler.fullName} (FAN ${request.traveler.fan})${request.verificationId ? `, verification #${request.verificationId}` : ""}. Notes: ${notes}`,
      metadata: {
        travelerId: request.travelerId,
        fan: request.traveler.fan,
        decision,
        supervisorNotes: notes,
        verificationId: request.verificationId ?? null,
        newVerificationDecision: request.decision ?? null,
      },
    });

    return res.status(200).json({ manualReviewRequest: request });
  } catch (err) {
    next(err);
  }
}

export async function history(req: Request, res: Response, next: NextFunction) {
  try {
    const history = await getManualReviewHistory();
    return res.status(200).json({ manualReviewRequests: history });
  } catch (err) {
    next(err);
  }
}