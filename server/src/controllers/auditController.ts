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