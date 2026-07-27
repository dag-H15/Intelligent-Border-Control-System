import { Request, Response, NextFunction } from "express";
import { AuditLevel, Role } from "../../generated/prisma";
import prisma from "../config/prisma";
import { createAuditLog, getClientIp } from "../services/auditService";
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
    await createAuditLog(req.user!.userId, `Admin created user ${email} (${role})`, getClientIp(req), AuditLevel.INFO);
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
    const actionParts: string[] = [`Admin updated user ${before?.email ?? user.email}`];
    if (name && name !== before?.name) actionParts.push(`name -> ${name}`);
    if (email && email !== before?.email) actionParts.push(`email -> ${email}`);
    if (role && role !== before?.role) actionParts.push(`role -> ${role}`);
    await createAuditLog(req.user!.userId, actionParts.join("; "), getClientIp(req), AuditLevel.INFO);
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
    await createAuditLog(req.user!.userId, `Admin reset password for ${user.email}`, getClientIp(req), AuditLevel.WARNING);
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
    await createAuditLog(req.user!.userId, `Admin unlocked user account: ${user.email}`, getClientIp(req), AuditLevel.INFO);
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
    await createAuditLog(req.user!.userId, `Admin deleted user ${removed.email}`, getClientIp(req), AuditLevel.CRITICAL);
    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
