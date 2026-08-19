import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

/** GET /api/checkpoints  — all active checkpoints (officers + supervisors) */
export async function getCheckpoints(req: Request, res: Response, next: NextFunction) {
  try {
    const checkpoints = await prisma.checkpoint.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return res.status(200).json({ checkpoints });
  } catch (err) {
    next(err);
  }
}

/** GET /api/checkpoints/all  — all checkpoints including inactive (admin only) */
export async function getAllCheckpoints(req: Request, res: Response, next: NextFunction) {
  try {
    const checkpoints = await prisma.checkpoint.findMany({
      orderBy: { name: "asc" },
    });
    return res.status(200).json({ checkpoints });
  } catch (err) {
    next(err);
  }
}

/** POST /api/checkpoints  — create a new checkpoint (admin only) */
export async function createCheckpoint(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, location } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required" });
    }
    const trimmedName = String(name).trim();

    const existing = await prisma.checkpoint.findUnique({ where: { name: trimmedName } });
    if (existing) {
      return res.status(409).json({ message: `A checkpoint named "${trimmedName}" already exists` });
    }

    const checkpoint = await prisma.checkpoint.create({
      data: {
        name: trimmedName,
        location: location ? String(location).trim() : null,
        isActive: true,
      },
    });

    await createAuditLog(
      req.user!.userId,
      `Created checkpoint: ${checkpoint.name} (id=${checkpoint.id})`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json({ checkpoint });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/checkpoints/:id  — update name/location/isActive (admin only) */
export async function updateCheckpoint(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid checkpoint id" });
    }

    const existing = await prisma.checkpoint.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Checkpoint not found" });
    }

    const { name, location, isActive } = req.body;
    const trimmedName = name ? String(name).trim() : undefined;

    // Check for duplicate name (exclude self)
    if (trimmedName && trimmedName !== existing.name) {
      const dup = await prisma.checkpoint.findUnique({ where: { name: trimmedName } });
      if (dup) {
        return res.status(409).json({ message: `A checkpoint named "${trimmedName}" already exists` });
      }
    }

    const checkpoint = await prisma.checkpoint.update({
      where: { id },
      data: {
        ...(trimmedName !== undefined ? { name: trimmedName } : {}),
        ...(location !== undefined ? { location: String(location).trim() || null } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      },
    });

    await createAuditLog(
      req.user!.userId,
      `Updated checkpoint id=${id}: ${JSON.stringify({ name: trimmedName, isActive })}`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(200).json({ checkpoint });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/checkpoints/:id  — soft-delete (deactivate) to preserve history (admin only) */
export async function deactivateCheckpoint(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid checkpoint id" });
    }

    const existing = await prisma.checkpoint.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: "Checkpoint not found" });
    }

    // Soft-delete: set isActive = false so historical crossing records remain intact
    const checkpoint = await prisma.checkpoint.update({
      where: { id },
      data: { isActive: false },
    });

    await createAuditLog(
      req.user!.userId,
      `Deactivated checkpoint: ${checkpoint.name} (id=${id})`,
      getClientIp(req),
      AuditLevel.WARNING
    );

    return res.status(200).json({ checkpoint, message: "Checkpoint deactivated" });
  } catch (err) {
    next(err);
  }
}
