import { Request } from "express";
import { AuditLevel, Prisma } from "../../generated/prisma";
import prisma from "../config/prisma";

/**
 * Structured input for a single audit event.
 *
 * The audit log answers: WHO did WHAT, WHEN, to WHICH resource,
 * with WHICH result and HOW severe — plus free-form details/metadata
 * (previous → new values, scores, reasons). Never store biometric
 * images/templates, passwords or secrets here.
 */
export interface AuditEventInput {
  /** Actor's user id, or null for system/anonymous events. */
  userId?: number | null;
  /** Short human-readable action summary, e.g. "User logged in". */
  action: string;
  ipAddress: string;
  severity?: AuditLevel;
  /** Logical resource type, e.g. "Verification", "Traveler", "Checkpoint". */
  resourceType?: string;
  /** Identifier of the affected resource (string so FANs also fit). */
  resourceId?: string | number | null;
  /** Outcome: SUCCESS | FAILED | VERIFIED | REJECTED | PENDING | APPROVED | DENIED */
  result?: string;
  /** Longer description of what happened (shown in the detail drawer). */
  description?: string;
  /**
   * Structured extra data. Use `changes` for previous → new value pairs:
   *   { changes: [{ field: "Approval Threshold", previous: 85, new: 90 }] }
   * Everything else is rendered as key/value detail rows (scores, reason...).
   */
  metadata?: Record<string, unknown>;
}

/** Canonical result values used across the app. */
export const AuditResult = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  DENIED: "DENIED",
} as const;

/**
 * Centralized audit writer. Never throws — an audit failure must not
 * break the primary request flow.
 */
export async function logAuditEvent(event: AuditEventInput): Promise<void> {
  try {
    const { metadata } = event;
    await prisma.auditLog.create({
      data: {
        userId: event.userId ?? null,
        action: event.action,
        level: event.severity ?? AuditLevel.INFO,
        ipAddress: event.ipAddress || "unknown",
        resourceType: event.resourceType ?? null,
        resourceId:
          event.resourceId !== undefined && event.resourceId !== null
            ? String(event.resourceId)
            : null,
        result: event.result ?? null,
        description: event.description ?? null,
        metadata:
          metadata && Object.keys(metadata).length > 0
            ? (metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * Backward-compatible helper used by existing call sites.
 * Delegates to logAuditEvent with only the basic fields.
 */
export async function createAuditLog(
  userId: number | null,
  action: string,
  ipAddress: string,
  level: AuditLevel = AuditLevel.INFO
) {
  await logAuditEvent({ userId, action, ipAddress, severity: level });
}

/**
 * Express stores the client IP on req.ip (respects "trust proxy" if configured).
 * Small helper so controllers don't repeat the fallback logic.
 */
export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}
