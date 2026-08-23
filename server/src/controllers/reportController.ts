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
  generateBorderCrossingReport,
} from "../services/reportService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
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
    await logAuditEvent({
      userId: req.user!.userId,
      action: "Invalid report request",
      ipAddress: getClientIp(req),
      severity: AuditLevel.WARNING,
      result: AuditResult.FAILED,
      resourceType: "Report",
      description: `Invalid report request for ${action}: startDate and endDate are required`,
    });
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

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report generated",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      description: `Generated verification summary report | range: ${range.startDate} – ${range.endDate} | total: ${result.summary.total}`,
      metadata: { reportType: "VERIFICATION_SUMMARY", startDate: range.startDate, endDate: range.endDate, records: result.summary.total },
    });

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

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report generated",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      description: `Generated override summary report | range: ${range.startDate} – ${range.endDate} | total: ${result.summary.total}`,
      metadata: { reportType: "OVERRIDE_SUMMARY", startDate: range.startDate, endDate: range.endDate, records: result.summary.total },
    });

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
    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report generated",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      description: `Generated officer activity report | range: ${range.startDate} – ${range.endDate} | ${officerLabel} | records: ${result.summary.reduce((s, o) => s + o.verifications, 0)}`,
      metadata: {
        reportType: "OFFICER_ACTIVITY",
        startDate: range.startDate,
        endDate: range.endDate,
        officerId: officerId ?? null,
        records: result.summary.reduce((s, o) => s + o.verifications, 0),
      },
    });

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

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report generated",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      description: `Generated manual review summary report | range: ${range.startDate} – ${range.endDate} | records: ${result.summary.length}`,
      metadata: { reportType: "MANUAL_REVIEW_SUMMARY", startDate: range.startDate, endDate: range.endDate, records: result.summary.length },
    });

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
 * POST /api/reports/generate
 * Supervisor action: generates a full BORDER_CROSSING report snapshot from the
 * selected filters (title, metadata, summary statistics, chart aggregations and
 * detailed records) and persists it for later viewing by Supervisors/Admins.
 */
export async function generateReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { reportTitle, startDate, endDate, officerId, checkpointId, direction, decision, alertStatus } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }
    if (!reportTitle || !String(reportTitle).trim()) {
      return res.status(400).json({ message: "reportTitle is required" });
    }

    const filters: any = {};
    if (officerId !== undefined && officerId !== "") filters.officerId = Number(officerId);
    if (checkpointId !== undefined && checkpointId !== "") filters.checkpointId = Number(checkpointId);
    if (direction) filters.direction = direction;
    if (decision) filters.decision = decision;
    if (alertStatus) filters.alertStatus = alertStatus;

    const report = await generateBorderCrossingReport({
      reportTitle: String(reportTitle).trim(),
      startDate: String(startDate),
      endDate: String(endDate),
      generatedBy: req.user!.userId,
      filters,
    });

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report generated",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      resourceId: String(report.id),
      description: `Generated report "${report.reportTitle}" | ${report.startDate.toISOString().slice(0, 10)} – ${report.endDate.toISOString().slice(0, 10)} | records: ${report.recordCount}`,
      metadata: {
        reportId: report.id,
        reportTitle: report.reportTitle,
        reportType: report.reportType ?? null,
        startDate: report.startDate.toISOString().slice(0, 10),
        endDate: report.endDate.toISOString().slice(0, 10),
        records: report.recordCount,
      },
    });

    return res.status(201).json({ report });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reports/save
 * Save a generated report with metadata
 */
export async function saveReport(req: Request, res: Response, next: NextFunction) {  try {
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

/**
 * POST /api/reports/exported
 * The report CSV is assembled in the browser, so the export itself never
 * touches the server. This lightweight endpoint records the "Report
 * exported" audit event when a user downloads a report.
 */
export async function auditExport(req: Request, res: Response, next: NextFunction) {
  try {
    const { reportId, reportTitle, recordCount } = req.body;

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Report exported",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Report",
      resourceId: reportId !== undefined && reportId !== null ? String(reportId) : null,
      description: `Exported report${reportTitle ? ` "${reportTitle}"` : ""} to CSV`,
      metadata: {
        reportId: reportId ?? null,
        reportTitle: reportTitle ?? null,
        records: recordCount ?? null,
      },
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
}
