import { Request, Response, NextFunction } from "express";
import { AuditLevel, Role } from "../../generated/prisma";
import prisma from "../config/prisma";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { createUser, deleteUser, listUsers, resetUserPassword, unlockUser, updateUser } from "../services/userManagementService";

const VALID_ROLES: Role[] = ["OFFICER", "SUPERVISOR", "ADMIN"];

function validateRole(role: unknown): role is Role {
  return typeof role === "string" && VALID_ROLES.includes(role as Role);
}

export async function getAllUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await listUsers();
    return res.status(200).json({ users });
  } catch (err) {
    next(err);
  }
}

export async function createNewUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password, and role are required" });
    }

    if (!validateRole(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const user = await createUser({ name, email, password, role });
    await logAuditEvent({
      userId: req.user!.userId,
      action: "User account created",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: String(user.id),
      description: `Admin created ${role} account for ${user.name} (${email})`,
      metadata: { name: user.name, email: user.email, role },
    });
    return res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function updateExistingUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Number(req.params.id);
    const { name, email, role } = req.body;
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "id must be a valid integer" });
    }

    if (role !== undefined && !validateRole(role)) {
      return res.status(400).json({ message: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }

    const before = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } });
    const user = await updateUser(userId, { name, email, role });

    const roleChanged = role !== undefined && before?.role !== undefined && role !== before.role;

    // Build previous → new change list for the audit detail view
    const changes: Array<{ field: string; previous: unknown; new: unknown }> = [];
    if (name !== undefined && name !== before?.name) changes.push({ field: "Name", previous: before?.name ?? "", new: name });
    if (email !== undefined && email !== before?.email) changes.push({ field: "Email", previous: before?.email ?? "", new: email });
    if (roleChanged) changes.push({ field: "Role", previous: before!.role, new: role });

    await logAuditEvent({
      userId: req.user!.userId,
      action: roleChanged ? "User role changed" : "User account updated",
      ipAddress: getClientIp(req),
      severity: roleChanged ? AuditLevel.WARNING : AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: String(userId),
      description:
        changes.length > 0
          ? `Admin updated ${before?.email ?? user.email}: ${changes.map((c) => `${c.field} (${String(c.previous)} → ${String(c.new)})`).join(", ")}`
          : `Admin updated user ${user.email} without value changes`,
      metadata: {
        affectedUserId: userId,
        affectedUserEmail: before?.email ?? user.email,
        changes,
      },
    });
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Number(req.params.id);
    const { password } = req.body;
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "id must be a valid integer" });
    }

    if (!password) {
      return res.status(400).json({ message: "password is required" });
    }

    const user = await resetUserPassword(userId, password);
    await logAuditEvent({
      userId: req.user!.userId,
      action: "User password reset",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: String(userId),
      description: `Admin reset the password for ${user.name} (${user.email})`,
      metadata: { affectedUserId: userId, affectedUserEmail: user.email },
    });
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function unlockAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "id must be a valid integer" });
    }

    const user = await unlockUser(userId);
    await logAuditEvent({
      userId: req.user!.userId,
      action: "User account unlocked",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: String(userId),
      description: `Admin unlocked the account for ${user.name} (${user.email})`,
      metadata: { affectedUserId: userId, affectedUserEmail: user.email },
    });
    return res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function removeUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ message: "id must be a valid integer" });
    }

    const removed = await deleteUser(userId);
    await logAuditEvent({
      userId: req.user!.userId,
      action: "User account deleted",
      ipAddress: getClientIp(req),
      severity: AuditLevel.CRITICAL,
      result: AuditResult.SUCCESS,
      resourceType: "User",
      resourceId: String(userId),
      description: `Admin deleted the account for ${removed.name} (${removed.email})`,
      metadata: { affectedUserId: userId, affectedUserEmail: removed.email },
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
