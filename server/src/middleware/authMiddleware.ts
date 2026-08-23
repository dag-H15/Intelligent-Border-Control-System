import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuditLevel, Role } from "../../generated/prisma";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthenticatedUser {
  userId: number;
  role: Role;
}

// Extend Express's Request type so req.user is typed everywhere downstream
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Verifies the Bearer token on the Authorization header and attaches
 * the decoded { userId, role } payload to req.user.
 *
 * Must run before authorize() on any protected route.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    void logAuditEvent({
      userId: null,
      action: "Missing or malformed Authorization header",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: AuditResult.DENIED,
      description: "Request rejected — no Bearer token supplied",
    });
    return res.status(401).json({ message: "Missing or malformed Authorization header" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    void logAuditEvent({
      userId: null,
      action: "Invalid or expired token",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: AuditResult.DENIED,
      description: "Request rejected — the supplied token is invalid or has expired",
    });
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * Role-based authorization. Use after authenticate() on a route:
 *
 *   router.post("/override/:id", authenticate, authorize("SUPERVISOR"), overrideController.decide);
 *
 * Rejects with 403 if req.user.role is not one of the allowed roles.
 */
export function authorize(...allowedRoles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      // authenticate() should always run first; this guards against misuse
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      await logAuditEvent({
        userId: req.user.userId,
        action: "Unauthorized access attempt",
        ipAddress: getClientIp(req),
        severity: AuditLevel.CRITICAL,
        result: AuditResult.DENIED,
        description: `Role ${req.user.role} attempted to access a resource requiring ${allowedRoles.join(", ")}`,
      });
      return res.status(403).json({
        message: `Access denied. Required role(s): ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
}