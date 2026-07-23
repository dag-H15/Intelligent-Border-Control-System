import { Request } from "express";
import { AuditLevel } from "../../generated/prisma";
import prisma from "../config/prisma";

/**
 * Writes an AuditLog entry. Called from services/controllers after any
 * security-relevant action: login, enrollment, verification, override,
 * report generation.
 *
 * Failures here are logged but never thrown — audit logging must not
 * break the primary request flow.
 */
export async function createAuditLog(
  userId: number | null,
  action: string,
  ipAddress: string,
  level: AuditLevel = AuditLevel.INFO
) {
  try {
    await prisma.auditLog.create({
      data: userId === null ? { action, ipAddress, level } : { userId, action, ipAddress, level },
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

/**
 * Express stores the client IP on req.ip (respects "trust proxy" if configured).
 * Small helper so controllers don't repeat the fallback logic.
 */
export function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}