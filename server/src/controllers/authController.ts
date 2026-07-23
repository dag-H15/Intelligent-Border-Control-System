import { Request, Response, NextFunction } from "express";
import { registerUser, loginUser } from "../services/authService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel, Role } from "../../generated/prisma";

const VALID_ROLES: Role[] = ["OFFICER", "SUPERVISOR", "ADMIN"];

/**
 * POST /api/auth/register
 * Creates a new system user (Officer, Supervisor, or Admin).
 */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, role } = req.body;

    // Basic input validation — controller stays thin, but requests must
    // be well-formed before they ever reach the service/database layer.
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

    // req.user exists here because the route requires an authenticated ADMIN
    await createAuditLog(
      req.user!.userId,
      `Registered new user (${role}): ${email}`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json({ user });
  } catch (err) {
    if ((err as any)?.statusCode === 409) {
      await createAuditLog(
        req.user!.userId,
        `Duplicate registration attempt for ${req.body.email}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
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

    await createAuditLog(result.user.id, "User logged in", getClientIp(req), AuditLevel.INFO);

    return res.status(200).json({
      token: result.token,
      id: result.user.id,
      name: result.user.name,
      role: result.user.role,
    });
  } catch (err) {
    if ((err as any)?.statusCode === 401) {
      await createAuditLog(
        (err as any).auditUserId ?? null,
        `Failed login attempt for ${email}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
    }
    next(err);
  }
}