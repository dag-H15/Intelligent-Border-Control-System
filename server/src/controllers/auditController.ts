import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { AuditLevel, Prisma, Role } from "../../generated/prisma";

/**
 * Audit log read API (ADMIN only).
 *
 * Read-only by design — there are intentionally NO update/delete routes.
 * Supports filtering (search, user, role, action category, severity,
 * result, date range), pagination, today-summary statistics and CSV export.
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Action-category filter. Each category maps to case-insensitive
 * substrings that cover both legacy and current action phrasings,
 * so historical rows remain filterable after this upgrade.
 */
const ACTION_CATEGORY_PATTERNS: Record<string, string[]> = {
  login: [
    "logged in",
    "login attempt",
    "failed login",
    "locked due to",
    "unauthorized access",
    "authorization header",
    "expired token",
  ],
  logout: ["logged out", "logout"],
  verification: ["verification completed", "verification attempt", "invalid verification"],
  enrollment: ["enrollment", "enrolled"],
  override: ["override"],
  manual_review: ["manual review", "re-enrollment"],
  settings: ["system settings", "threshold", "system configuration"],
  checkpoint: ["checkpoint"],
  user_management: [
    "created user",
    "updated user",
    "reset password",
    "unlocked user",
    "deleted user",
    "user account",
    "user role changed",
    "registered new user",
    "registration",
  ],
  report: ["report"],
  watchlist: ["alert status", "watchlist"],
  lookup: ["traveler lookup"],
};

function containsAny(patterns: string[]): Prisma.AuditLogWhereInput {
  return {
    OR: patterns.map((p) => ({ action: { contains: p, mode: "insensitive" as const } })),
  };
}

/** Parses a query param as a Date; date-only end dates get end-of-day. */
function parseDateParam(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  // Date-only strings (e.g. "2026-08-24") must cover the whole local day
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    d.setHours(23, 59, 59, 999);
  }
  return d;
}

/** Builds the shared Prisma WHERE clause from query-string filters. */
function buildAuditWhere(query: Request["query"]): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  // Search: user name/email, action, description, resource ID, IP address
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) {
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { resourceId: { contains: q, mode: "insensitive" } },
      { ipAddress: { contains: q, mode: "insensitive" } },
      { user: { name: { contains: q, mode: "insensitive" } } },
      { user: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  // User filter (dynamic — actual database users)
  const userId = Number(query.userId);
  if (Number.isInteger(userId) && userId > 0) {
    where.userId = userId;
  }

  // Role filter — matches the project's Role enum
  const role = String(query.role ?? "");
  if (["OFFICER", "SUPERVISOR", "ADMIN"].includes(role)) {
    where.user = { ...(where.user as object), role: role as Role };
  }

  // Severity filter — matches the project's AuditLevel enum
  const level = String(query.level ?? "");
  if (["INFO", "WARNING", "CRITICAL"].includes(level)) {
    where.level = level as AuditLevel;
  }

  // Result filter
  const result = String(query.result ?? "").toUpperCase();
  if (result) {
    where.result = result;
  }

  // Action-category filter
  const actionType = String(query.actionType ?? "");
  if (ACTION_CATEGORY_PATTERNS[actionType]) {
    const categoryFilter = containsAny(ACTION_CATEGORY_PATTERNS[actionType]);
    where.AND = where.AND
      ? [...(Array.isArray(where.AND) ? where.AND : [where.AND]), categoryFilter]
      : [categoryFilter];
  }

  // Date-range filter. The client sends explicit ISO datetimes computed in
  // the browser's timezone so "today" behaves identically on both ends.
  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate, true);
  if (startDate || endDate) {
    where.timestamp = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  return where;
}

const LIST_SELECT = {
  id: true,
  userId: true,
  action: true,
  level: true,
  ipAddress: true,
  timestamp: true,
  resourceType: true,
  resourceId: true,
  result: true,
  description: true,
  metadata: true,
  user: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.AuditLogSelect;

/**
 * GET /api/audit-logs
 * Query params: q, userId, role, actionType, level, result,
 *               startDate, endDate, page, limit
 */
export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const where = buildAuditWhere(req.query);

    const page = Math.max(1, Number(req.query.page) || 1);
    const requestedLimit = Number(req.query.limit) || DEFAULT_PAGE_SIZE;
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedLimit));

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return res.status(200).json({
      auditLogs: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/stats
 * Summary-card counts for today, aggregated in the database.
 */
export async function getAuditLogStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const today = { timestamp: { gte: start, lte: end } };

    const [
      eventsToday,
      loginsToday,
      overridesToday,
      enrollmentsToday,
      verificationsToday,
    ] = await Promise.all([
      prisma.auditLog.count({ where: today }),
      prisma.auditLog.count({
        where: { ...today, action: { contains: "logged in", mode: "insensitive" } },
      }),
      prisma.auditLog.count({
        where: { ...today, action: { contains: "override", mode: "insensitive" } },
      }),
      prisma.auditLog.count({
        where: {
          AND: [
            today,
            {
              OR: [
                { action: { contains: "traveler enrolled", mode: "insensitive" } },
                { action: { contains: "enrollment started", mode: "insensitive" } },
              ],
            },
          ],
        },
      }),
      prisma.auditLog.count({
        where: {
          AND: [
            today,
            {
              OR: [
                { action: { contains: "verification completed", mode: "insensitive" } },
                { action: { contains: "verification attempt", mode: "insensitive" } },
              ],
            },
          ],
        },
      }),
    ]);

    return res.status(200).json({
      eventsToday,
      loginsToday,
      overridesToday,
      enrollmentsToday,
      verificationsToday,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/export
 * Streams a CSV of ALL events matching the current filters (no pagination).
 */
export async function exportAuditLogsCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const where = buildAuditWhere(req.query);

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: 10000,
      select: LIST_SELECT,
    });

    const csvEscape = (value: unknown): string => {
      const s =
        value === null || value === undefined
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
      return `"${s.replace(/"/g, '""')}"`;
    };

    const fmtTimestamp = (d: Date): string => {
      const pad = (n: number) => String(n).padStart(2, "0");
      return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      );
    };

    const header = [
      "Timestamp",
      "User",
      "Role",
      "Action",
      "Resource",
      "Resource ID",
      "Severity",
      "Result",
      "IP Address",
      "Description",
    ];

    const rows = logs.map((l) =>
      [
        fmtTimestamp(new Date(l.timestamp)),
        l.user?.name ?? "System",
        l.user?.role ?? "SYSTEM",
        l.action,
        l.resourceType ?? "",
        l.resourceId ?? "",
        l.level,
        l.result ?? "",
        l.ipAddress,
        l.description ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );

    const csv = "\uFEFF" + header.map(csvEscape).join(",") + "\n" + rows.join("\n");

    const todayStr = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit_logs_${todayStr}.csv"`
    );
    return res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/audit-logs/:id
 * Detailed information for a single audit event (detail drawer).
 * NOTE: must stay registered AFTER the /stats and /export routes.
 */
export async function getAuditLogDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid audit log ID" });
    }

    const log = await prisma.auditLog.findUnique({
      where: { id },
      select: LIST_SELECT,
    });

    if (!log) {
      return res.status(404).json({ message: "Audit log not found" });
    }

    return res.status(200).json(log);
  } catch (err) {
    next(err);
  }
}
