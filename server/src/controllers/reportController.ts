import { Request, Response, NextFunction } from "express";
import {
  generateVerificationSummary,
  generateOverrideSummary,
  generateOfficerActivity,
  generateManualReviewSummary,
  listReports,
  listOfficers,
  getDetailedVerificationRecords,
  getVerificationStatistics,
  getVerificationChartData,
  getVerificationDetail,
  saveGeneratedReport,
  getGeneratedReportById,
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

/**
 * POST /api/reports/detailed-records
 * Get detailed verification records with comprehensive filtering
 */
export async function detailedRecords(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, officerId, checkpointId, direction, decision, alertStatus, page, limit } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }

    const result = await getDetailedVerificationRecords({
      startDate: String(startDate),
      endDate: String(endDate),
      officerId: officerId !== undefined && officerId !== "" ? Number(officerId) : undefined,
      checkpointId: checkpointId !== undefined && checkpointId !== "" ? Number(checkpointId) : undefined,
      direction: direction || undefined,
      decision: decision || undefined,
      alertStatus: alertStatus || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reports/statistics
 * Get verification statistics with filters for summary cards
 */
export async function statistics(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, officerId, checkpointId, direction, decision, alertStatus } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }

    const stats = await getVerificationStatistics({
      startDate: String(startDate),
      endDate: String(endDate),
      officerId: officerId !== undefined && officerId !== "" ? Number(officerId) : undefined,
      checkpointId: checkpointId !== undefined && checkpointId !== "" ? Number(checkpointId) : undefined,
      direction: direction || undefined,
      decision: decision || undefined,
      alertStatus: alertStatus || undefined,
    });

    return res.status(200).json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reports/chart-data
 * Get chart data with filters
 */
export async function chartData(req: Request, res: Response, next: NextFunction) {
  try {
    const { startDate, endDate, officerId, checkpointId, direction, alertStatus } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }

    const data = await getVerificationChartData({
      startDate: String(startDate),
      endDate: String(endDate),
      officerId: officerId !== undefined && officerId !== "" ? Number(officerId) : undefined,
      checkpointId: checkpointId !== undefined && checkpointId !== "" ? Number(checkpointId) : undefined,
      direction: direction || undefined,
      alertStatus: alertStatus || undefined,
    });

    return res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/verification-detail/:id
 * Get complete details for a single verification
 */
export async function verificationDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid verification ID" });
    }

    const detail = await getVerificationDetail(id);
    return res.status(200).json(detail);
  } catch (err: any) {
    if (err.message === "Verification not found") {
      return res.status(404).json({ message: "Verification not found" });
    }
    next(err);
  }
}



/**
 * POST /api/reports/save
 * Save a generated report with metadata
 */
export async function saveReport(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      reportType,
      reportTitle,
      startDate,
      endDate,
      filters,
      summaryData,
      recordCount,
    } = req.body;

    if (!reportType || !reportTitle || !startDate || !endDate) {
      return res.status(400).json({
        message: "reportType, reportTitle, startDate, and endDate are required",
      });
    }

    const report = await saveGeneratedReport({
      reportType,
      reportTitle,
      startDate,
      endDate,
      generatedBy: req.user!.userId,
      filters: filters || {},
      summaryData: summaryData || {},
      recordCount: recordCount || 0,
    });

    return res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reports/:id
 * Get a specific generated report by ID
 */
export async function getReportById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: "Invalid report ID" });
    }

    const report = await getGeneratedReportById(id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.status(200).json({ report });
  } catch (err) {
    next(err);
  }
}
