import { Request, Response, NextFunction } from "express";
import {
  generateVerificationSummary,
  generateOverrideSummary,
  generateOfficerActivity,
  generateManualReviewSummary,
  listReports,
  listOfficers,
} from "../services/reportService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

/**
 * Validate that startDate and endDate are present in the request body.
 * Writes a WARNING audit log and returns 400 if either is missing.
 * Returns the validated strings on success.
 */
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
  return { startDate: String(startDate), endDate: String(endDate) };
}

/** POST /api/reports/verification-summary */
export async function verificationSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const range = await validateDateRange(req, res, "verification summary");
    if (!range) return;

    const result = await generateVerificationSummary({
      ...range,
      generatedBy: req.user!.userId,
    });

    await createAuditLog(
      req.user!.userId,
      `Generated verification summary report | range: ${range.startDate} – ${range.endDate} | total: ${result.summary.total}`,
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
    const range = await validateDateRange(req, res, "override summary");
    if (!range) return;

    const result = await generateOverrideSummary({
      ...range,
      generatedBy: req.user!.userId,
    });

    await createAuditLog(
      req.user!.userId,
      `Generated override summary report | range: ${range.startDate} – ${range.endDate} | total: ${result.summary.total}`,
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
    const range = await validateDateRange(req, res, "officer activity");
    if (!range) return;

    // Parse the optional officer filter.
    // The frontend sends officerId as a number (database ID).
    // undefined means "all officers".
    const rawOfficerId = req.body.officerId;
    const officerId =
      rawOfficerId !== undefined && rawOfficerId !== "" && rawOfficerId !== null
        ? Number(rawOfficerId)
        : undefined;

    if (officerId !== undefined && isNaN(officerId)) {
      res.status(400).json({ message: "officerId must be a valid numeric database ID" });
      return;
    }

    const result = await generateOfficerActivity({
      ...range,
      generatedBy: req.user!.userId,
      officerId,
    });

    const officerLabel = officerId !== undefined ? `officerId: ${officerId}` : "all officers";
    await createAuditLog(
      req.user!.userId,
      `Generated officer activity report | range: ${range.startDate} – ${range.endDate} | ${officerLabel} | records: ${result.summary.reduce((s, o) => s + o.verifications, 0)}`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

/** POST /api/reports/manual-review-summary */
export async function manualReviewSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const range = await validateDateRange(req, res, "manual review summary");
    if (!range) return;

    const result = await generateManualReviewSummary({
      ...range,
      generatedBy: req.user!.userId,
    });

    await createAuditLog(
      req.user!.userId,
      `Generated manual review summary report | range: ${range.startDate} – ${range.endDate} | records: ${result.summary.length}`,
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

/**
 * GET /api/reports/officers
 * Returns all users with role OFFICER for the officer-filter dropdown.
 * Accessible to SUPERVISORs (same auth level as report generation).
 */
export async function officers(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listOfficers();
    return res.status(200).json({ officers: data });
  } catch (err) {
    next(err);
  }
}
