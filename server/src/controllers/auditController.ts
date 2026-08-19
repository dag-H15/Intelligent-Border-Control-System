import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";

/**
 * GET /api/audit-logs
 * Optional query params: userId, limit (default 100)
 */
export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.query;
    const limit = req.query.limit ? Number(req.query.limit) : 100;

    const logs = await prisma.auditLog.findMany({
      where: userId ? { userId: Number(userId) } : undefined,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { user: { select: { name: true, role: true, email: true } } },
    });

    return res.status(200).json({ auditLogs: logs });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/:id
 * Get detailed information for a single audit log entry
 */
export async function getAuditLogDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid audit log ID" });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!log) {
      return res.status(404).json({ message: "Audit log not found" });
    }

    return res.status(200).json(log);
  } catch (err) {
    next(err);
  }
}