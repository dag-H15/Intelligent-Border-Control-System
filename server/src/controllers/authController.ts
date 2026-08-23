import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { registerUser, loginUser } from "../services/authService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel, Role } from "../../generated/prisma";

const VALID_ROLES: Role[] = ["OFFICER", "SUPERVISOR", "ADMIN"];

/**
 * POST /api/auth/register
 * Creates a new system user (Officer, Supervisor, or Admin).
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "name, email, password, and role are all required",
      });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({
        message: `role must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    const user = await registerUser({ name, email, password, role });

    await logAuditEvent({
      userId: req.user!.userId,
      action: "User account created",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: user.id,
      description: `New ${role} account created for ${name} (${email})`,
    });

    return res.status(201).json({ user });
  } catch (err) {
    if ((err as any)?.statusCode === 409) {
      await logAuditEvent({
        userId: req.user?.userId ?? null,
        action: "Duplicate registration attempt",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "User",
        description: `Registration rejected — an account with email ${req.body.email} already exists`,
      });
    }
    next(err);
  }
}

/**
 * POST /api/auth/login
 * Verifies credentials and returns a JWT + basic user info.
 */
export async function login(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const result = await loginUser({ email, password });

    await logAuditEvent({
      userId: result.user.id,
      action: "User logged in",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: result.user.id,
      description: `${result.user.role} ${result.user.name} authenticated successfully`,
    });

    return res.status(200).json({
      token: result.token,
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    });
  } catch (err) {
    const statusCode = (err as any)?.statusCode;
    if (statusCode === 423) {
      await logAuditEvent({
        userId: (err as any).auditUserId ?? null,
        action: "Account locked after repeated failed logins",
        ipAddress: getClientIp(req),
        severity: AuditLevel.CRITICAL,
        result: AuditResult.DENIED,
        resourceType: "User",
        description: `Account temporarily locked due to multiple failed login attempts for ${email}`,
      });
    } else if (statusCode === 401) {
      await logAuditEvent({
        userId: (err as any).auditUserId ?? null,
        action: "Failed login attempt",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "User",
        description: `Invalid credentials supplied for ${email}`,
      });
    }
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Audits a deliberate logout. The client clears its token afterwards.
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    let userName = "";
    let userRole = "";
    if (userId !== undefined) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, role: true },
      });
      userName = user?.name ?? "";
      userRole = user?.role ?? "";
    }

    await logAuditEvent({
      userId: userId ?? null,
      action: "User logged out",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: userId ?? null,
      description:
        userName && userRole
          ? `${userRole} ${userName} ended their session`
          : "Session ended",
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
