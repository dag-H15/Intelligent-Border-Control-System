import { Request, Response, NextFunction } from "express";
import {
  generateVerificationSummary,
  generateOverrideSummary,
  generateOfficerActivity,
  listReports,
} from "../services/reportService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

async function validateDateRange(
  req: Request,
  res: Response,
  action: string
): Promise<{ startDate: string; endDate: string } | null> {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    await createAuditLog(
      req.user!.userId,
      `Invalid report request for ${action}: startDate and endDate are required`,
      getClientIp(req),
      AuditLevel.WARNING
    );
    res.status(400).json({ message: "startDate and endDate are required" });
    return null;
  }
  return { startDate, endDate };
}

/** POST /api/reports/verification-summary */
export async function verificationSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const range = await validateDateRange(req, res, "verification summary report");
    if (!range) return;

    const result = await generateVerificationSummary({ ...range, generatedBy: req.user!.userId });

    await createAuditLog(
      req.user!.userId,
      "Generated verification summary report",
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /api/reports/override-summary */
export async function overrideSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const range = await validateDateRange(req, res, "override summary report");
    if (!range) return;

    const result = await generateOverrideSummary({ ...range, generatedBy: req.user!.userId });

    await createAuditLog(
      req.user!.userId,
      "Generated override summary report",
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /api/reports/officer-activity */
export async function officerActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const range = await validateDateRange(req, res, "officer activity report");
    if (!range) return;

    const result = await generateOfficerActivity({ ...range, generatedBy: req.user!.userId });

    await createAuditLog(
      req.user!.userId,
      "Generated officer activity report",
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** GET /api/reports */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const reports = await listReports();
    return res.status(200).json({ reports });
  } catch (err) {
    next(err);
  }
}