import prisma from "../config/prisma";

interface DateRange {
  startDate: string | Date;
  endDate: string | Date;
  generatedBy: number;
}

interface OfficerDateRange extends DateRange {
  /** When provided, restrict results to this officer only. */
  officerId?: number;
}

/**
 * Convert a YYYY-MM-DD string (or Date) to the start of that day in UTC.
 *   "2025-08-17" → 2025-08-17T00:00:00.000Z
 */
function toStartOfDay(value: string | Date): Date {
  const d = typeof value === "string" ? value : value.toISOString().slice(0, 10);
  // Appending "T00:00:00.000Z" forces UTC midnight regardless of server timezone
  return new Date(`${typeof value === "string" ? value.slice(0, 10) : d}T00:00:00.000Z`);
}

/**
 * Convert a YYYY-MM-DD string (or Date) to the END of that day in UTC.
 *   "2025-08-17" → 2025-08-17T23:59:59.999Z
 *
 * This is the fix for the primary "no data" bug: previously `new Date("2025-08-17")`
 * produced midnight UTC, so any record created after 00:00:00 on the end date was
 * excluded from the query.
 */
function toEndOfDay(value: string | Date): Date {
  const d = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return new Date(`${d}T23:59:59.999Z`);
}

/**
 * Verification summary: counts of each decision outcome within the range.
 */
export async function generateVerificationSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = toStartOfDay(startDate);
  const end   = toEndOfDay(endDate);

  const logs = await prisma.verificationLog.findMany({
    where: { timestamp: { gte: start, lte: end } },
    select: { finalDecision: true },
  });

  const summary = {
    total: logs.length,
    verified: logs.filter((l) => l.finalDecision === "VERIFIED").length,
    rejected: logs.filter((l) => l.finalDecision === "REJECTED").length,
    pendingSupervisorReview: logs.filter((l) => l.finalDecision === "PENDING_SUPERVISOR_REVIEW").length,
  };

  const report = await prisma.report.create({
    data: {
      reportType: "VERIFICATION_SUMMARY",
      reportTitle: "Verification Summary Report",
      startDate: start,
      endDate: end,
      generatedBy,
      recordCount: summary.total,
      summaryData: summary,
    },
  });

  return { report, summary };
}

/**
 * Override summary: counts of supervisor overrides within the range,
 * grouped by the decision the supervisor issued.
 */
export async function generateOverrideSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = toStartOfDay(startDate);
  const end   = toEndOfDay(endDate);

  const overrides = await prisma.overrideRecord.findMany({
    where: { timestamp: { gte: start, lte: end } },
    select: { newDecision: true },
  });

  const summary = {
    total: overrides.length,
    approvedToVerified: overrides.filter((o) => o.newDecision === "VERIFIED").length,
    approvedToRejected: overrides.filter((o) => o.newDecision === "REJECTED").length,
  };

  const report = await prisma.report.create({
    data: {
      reportType: "OVERRIDE_SUMMARY",
      reportTitle: "Override Summary Report",
      startDate: start,
      endDate: end,
      generatedBy,
      recordCount: summary.total,
      summaryData: summary,
    },
  });

  return { report, summary };
}

/**
 * Officer activity: verification attempts per officer within the range.
 * When officerId is supplied only that officer's records are returned.
 */
export async function generateOfficerActivity({
  startDate,
  endDate,
  generatedBy,
  officerId,
}: OfficerDateRange) {
  const start = toStartOfDay(startDate);
  const end   = toEndOfDay(endDate);

  const whereClause: {
    timestamp: { gte: Date; lte: Date };
    officerId?: number;
  } = {
    timestamp: { gte: start, lte: end },
    ...(officerId !== undefined ? { officerId } : {}),
  };

  const logs = await prisma.verificationLog.findMany({
    where: whereClause,
    include: { officer: { select: { id: true, name: true } } },
  });

  const byOfficer = new Map<number, { officerId: number; officerName: string; verifications: number }>();
  for (const log of logs) {
    const entry = byOfficer.get(log.officerId) ?? {
      officerId: log.officerId,
      officerName: log.officer.name,
      verifications: 0,
    };
    entry.verifications += 1;
    byOfficer.set(log.officerId, entry);
  }

  const summaryArray = Array.from(byOfficer.values());

  const report = await prisma.report.create({
    data: {
      reportType: "OFFICER_ACTIVITY",
      reportTitle: "Officer Activity Report",
      startDate: start,
      endDate: end,
      generatedBy,
      recordCount: summaryArray.length,
      summaryData: { officers: summaryArray },
    },
  });

  return { report, summary: summaryArray };
}

/**
 * Manual review summary: completed reviews (non-pending) within the range.
 * Filters on updatedAt so the range reflects when reviews were resolved.
 */
export async function generateManualReviewSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = toStartOfDay(startDate);
  const end   = toEndOfDay(endDate);

  const requests = await prisma.manualReviewRequest.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED", "RE_ENROLLMENT_REQUESTED"] },
      updatedAt: { gte: start, lte: end },
    },
    include: {
      traveler:   { select: { fullName: true, fan: true } },
      officer:    { select: { name: true } },
      supervisor: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const summary = requests.map((r) => ({
    id: r.id,
    travelerName: r.traveler.fullName,
    passportNo:   r.traveler.fan,
    manualReviewType: r.reason,
    officer:    r.officer.name,
    supervisor: r.supervisor?.name ?? "System",
    decision:   r.status,
    submissionDate: r.createdAt.toISOString(),
    reviewDate:     r.updatedAt.toISOString(),
  }));

  const report = await prisma.report.create({
    data: {
      reportType: "MANUAL_REVIEW_SUMMARY",
      reportTitle: "Manual Review Summary Report",
      startDate: start,
      endDate: end,
      generatedBy,
      recordCount: summary.length,
      summaryData: { reviews: summary },
    },
  });

  return { report, summary };
}

/** Lists all previously generated report metadata records. */
export async function listReports() {
  return prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { generatedByUser: { select: { name: true, role: true } } },
  });
}

/** Returns all users whose role is OFFICER, for the officer-filter dropdown. */
export async function listOfficers() {
  return prisma.user.findMany({
    where:   { role: "OFFICER" },
    select:  { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Comprehensive filter interface for detailed verification records
 */
interface VerificationFilters {
  startDate: string | Date;
  endDate: string | Date;
  officerId?: number;
  checkpointId?: number;
  direction?: "ENTRY" | "EXIT";
  decision?: "VERIFIED" | "PENDING_SUPERVISOR_REVIEW" | "REJECTED";
  alertStatus?: "NONE" | "WARNING" | "CRITICAL";
  page?: number;
  limit?: number;
}

/**
 * Get detailed verification records with comprehensive filters
 * Returns paginated results with full traveler, officer, checkpoint data
 */
export async function getDetailedVerificationRecords(filters: VerificationFilters) {
  const start = toStartOfDay(filters.startDate);
  const end = toEndOfDay(filters.endDate);
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const skip = (page - 1) * limit;

  const whereClause: any = {
    timestamp: { gte: start, lte: end },
  };

  if (filters.officerId !== undefined) whereClause.officerId = filters.officerId;
  if (filters.checkpointId !== undefined) whereClause.checkpointId = filters.checkpointId;
  if (filters.direction !== undefined) whereClause.direction = filters.direction;
  if (filters.decision !== undefined) whereClause.finalDecision = filters.decision;
  if (filters.alertStatus !== undefined) whereClause.alertStatusAtVerification = filters.alertStatus;

  const [records, total] = await Promise.all([
    prisma.verificationLog.findMany({
      where: whereClause,
      orderBy: { timestamp: "desc" },
      skip,
      take: limit,
      include: {
        traveler: {
          select: {
            id: true,
            fan: true,
            fullName: true,
            nationality: true,
            dateOfBirth: true,
            gender: true,
            photo: true,
            enrollmentStatus: true,
          },
        },
        officer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        checkpoint: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        manualReviewRequest: {
          select: {
            id: true,
            reason: true,
            status: true,
            decision: true,
            supervisorNotes: true,
            supervisor: {
              select: {
                id: true,
                name: true,
              },
            },
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    }),
    prisma.verificationLog.count({ where: whereClause }),
  ]);

  return {
    records,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get comprehensive statistics with filters for summary cards
 */
export async function getVerificationStatistics(filters: Omit<VerificationFilters, "page" | "limit">) {
  const start = toStartOfDay(filters.startDate);
  const end = toEndOfDay(filters.endDate);

  const whereClause: any = {
    timestamp: { gte: start, lte: end },
  };

  if (filters.officerId !== undefined) whereClause.officerId = filters.officerId;
  if (filters.checkpointId !== undefined) whereClause.checkpointId = filters.checkpointId;
  if (filters.direction !== undefined) whereClause.direction = filters.direction;
  if (filters.decision !== undefined) whereClause.finalDecision = filters.decision;
  if (filters.alertStatus !== undefined) whereClause.alertStatusAtVerification = filters.alertStatus;

  const logs = await prisma.verificationLog.findMany({
    where: whereClause,
    select: {
      finalDecision: true,
      direction: true,
      alertStatusAtVerification: true,
      manualReviewRequest: {
        select: { status: true },
      },
    },
  });

  const stats = {
    totalCrossings: logs.length,
    verified: logs.filter((l) => l.finalDecision === "VERIFIED").length,
    rejected: logs.filter((l) => l.finalDecision === "REJECTED").length,
    pendingReview: logs.filter((l) => l.finalDecision === "PENDING_SUPERVISOR_REVIEW").length,
    entries: logs.filter((l) => l.direction === "ENTRY").length,
    exits: logs.filter((l) => l.direction === "EXIT").length,
    manualReviews: logs.filter((l) => l.manualReviewRequest !== null).length,
    watchlistWarnings: logs.filter((l) => l.alertStatusAtVerification === "WARNING").length,
    watchlistCritical: logs.filter((l) => l.alertStatusAtVerification === "CRITICAL").length,
  };

  return stats;
}

/**
 * Get chart data for visualizations
 */
export async function getVerificationChartData(filters: Omit<VerificationFilters, "page" | "limit">) {
  const start = toStartOfDay(filters.startDate);
  const end = toEndOfDay(filters.endDate);

  const whereClause: any = {
    timestamp: { gte: start, lte: end },
  };

  if (filters.officerId !== undefined) whereClause.officerId = filters.officerId;
  if (filters.checkpointId !== undefined) whereClause.checkpointId = filters.checkpointId;
  if (filters.direction !== undefined) whereClause.direction = filters.direction;
  if (filters.alertStatus !== undefined) whereClause.alertStatusAtVerification = filters.alertStatus;

  const logs = await prisma.verificationLog.findMany({
    where: whereClause,
    select: {
      finalDecision: true,
      direction: true,
      alertStatusAtVerification: true,
      timestamp: true,
      checkpoint: {
        select: { name: true },
      },
    },
  });

  // Decision breakdown
  const decisions = {
    verified: logs.filter((l) => l.finalDecision === "VERIFIED").length,
    pending: logs.filter((l) => l.finalDecision === "PENDING_SUPERVISOR_REVIEW").length,
    rejected: logs.filter((l) => l.finalDecision === "REJECTED").length,
  };

  // Entry vs Exit
  const directionBreakdown = {
    entry: logs.filter((l) => l.direction === "ENTRY").length,
    exit: logs.filter((l) => l.direction === "EXIT").length,
  };

  // Watchlist status breakdown (snapshot of the alert status at verification time)
  const watchlistBreakdown = {
    none: logs.filter((l) => (l.alertStatusAtVerification ?? "NONE") === "NONE").length,
    warning: logs.filter((l) => l.alertStatusAtVerification === "WARNING").length,
    critical: logs.filter((l) => l.alertStatusAtVerification === "CRITICAL").length,
  };

  // Crossings by checkpoint
  const checkpointMap = new Map<string, number>();
  logs.forEach((log) => {
    const name = log.checkpoint?.name ?? "Unknown";
    checkpointMap.set(name, (checkpointMap.get(name) ?? 0) + 1);
  });
  const byCheckpoint = Array.from(checkpointMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Crossings over time (group by day)
  const dailyMap = new Map<string, number>();
  logs.forEach((log) => {
    const day = log.timestamp.toISOString().slice(0, 10);
    dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
  });
  const overTime = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    decisions,
    directionBreakdown,
    watchlistBreakdown,
    byCheckpoint,
    overTime,
  };
}

/**
 * Get complete verification detail for a single verification ID
 * Used when user clicks a row in the report table
 */
export async function getVerificationDetail(verificationId: number) {
  const verification = await prisma.verificationLog.findUnique({
    where: { id: verificationId },
    include: {
      traveler: {
        select: {
          id: true,
          fan: true,
          fullName: true,
          dateOfBirth: true,
          gender: true,
          nationality: true,
          photo: true,
          enrollmentStatus: true,
          alertStatus: true,
          alertReason: true,
        },
      },
      officer: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      checkpoint: {
        select: {
          id: true,
          name: true,
          location: true,
        },
      },
      manualReviewRequest: {
        select: {
          id: true,
          reason: true,
          officerNotes: true,
          status: true,
          decision: true,
          supervisorNotes: true,
          createdAt: true,
          updatedAt: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      overrideRecord: {
        select: {
          id: true,
          previousDecision: true,
          newDecision: true,
          reason: true,
          timestamp: true,
          supervisor: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!verification) {
    throw new Error("Verification not found");
  }

  return verification;
}


/**
 * Save a generated report with full metadata for history viewing
 */
export async function saveGeneratedReport({
  reportType,
  reportTitle,
  startDate,
  endDate,
  generatedBy,
  filters,
  summaryData,
  recordCount,
}: {
  reportType: "BORDER_CROSSING" | "MANUAL_REVIEW_SUMMARY" | "BIOMETRIC_VERIFICATION" | "ENTRY_EXIT" | "OFFICER_ACTIVITY" | "CHECKPOINT_ACTIVITY";
  reportTitle: string;
  startDate: string | Date;
  endDate: string | Date;
  generatedBy: number;
  filters: any;
  summaryData: any;
  recordCount: number;
}) {
  const start = toStartOfDay(startDate);
  const end = toEndOfDay(endDate);

  const report = await prisma.report.create({
    data: {
      reportType,
      reportTitle,
      startDate: start,
      endDate: end,
      generatedBy,
      filters: filters || {},
      summaryData: summaryData || {},
      recordCount,
    },
    include: {
      generatedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return report;
}

/**
 * Get a specific generated report by ID with full details
 */
export async function getGeneratedReportById(reportId: number) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      generatedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });

  return report;
}

/** Filter payload accepted by the generated-report flow. */
interface GenerateReportFilters {
  officerId?: number;
  checkpointId?: number;
  direction?: "ENTRY" | "EXIT";
  decision?: "VERIFIED" | "PENDING_SUPERVISOR_REVIEW" | "REJECTED";
  alertStatus?: "NONE" | "WARNING" | "CRITICAL";
}

/** Safety cap so a runaway filter cannot freeze the server. */
const MAX_REPORT_RECORDS = 5000;

/**
 * Generate a BORDER_CROSSING report snapshot.
 *
 * A single authoritative query feeds the statistics, the chart aggregations and
 * the stored detailed records, guaranteeing that summary cards, charts, table
 * and later exports all describe exactly the same dataset. Everything is
 * persisted on the Report row so opening the report later shows the data as it
 * was at generation time, even if the live database has changed since.
 */
export async function generateBorderCrossingReport({
  reportTitle,
  startDate,
  endDate,
  generatedBy,
  filters,
}: {
  reportTitle: string;
  startDate: string | Date;
  endDate: string | Date;
  generatedBy: number;
  filters: GenerateReportFilters;
}) {
  const start = toStartOfDay(startDate);
  const end = toEndOfDay(endDate);

  const whereClause: any = { timestamp: { gte: start, lte: end } };
  if (filters.officerId !== undefined) whereClause.officerId = filters.officerId;
  if (filters.checkpointId !== undefined) whereClause.checkpointId = filters.checkpointId;
  if (filters.direction !== undefined) whereClause.direction = filters.direction;
  if (filters.decision !== undefined) whereClause.finalDecision = filters.decision;
  if (filters.alertStatus !== undefined) whereClause.alertStatusAtVerification = filters.alertStatus;

  // --- Single authoritative dataset ---
  const logs = await prisma.verificationLog.findMany({
    where: whereClause,
    orderBy: { timestamp: "desc" },
    take: MAX_REPORT_RECORDS,
    include: {
      traveler: { select: { id: true, fan: true, fullName: true, nationality: true } },
      officer: { select: { id: true, name: true } },
      checkpoint: { select: { id: true, name: true, location: true } },
      manualReviewRequest: {
        select: {
          id: true,
          reason: true,
          status: true,
          decision: true,
          supervisorNotes: true,
          updatedAt: true,
          supervisor: { select: { name: true } },
        },
      },
    },
  });

  // --- Statistics derived from the same dataset ---
  const statistics = {
    totalCrossings: logs.length,
    verified: logs.filter((l) => l.finalDecision === "VERIFIED").length,
    rejected: logs.filter((l) => l.finalDecision === "REJECTED").length,
    pendingReview: logs.filter((l) => l.finalDecision === "PENDING_SUPERVISOR_REVIEW").length,
    entries: logs.filter((l) => l.direction === "ENTRY").length,
    exits: logs.filter((l) => l.direction === "EXIT").length,
    manualReviews: logs.filter((l) => l.manualReviewRequest !== null).length,
    watchlistWarnings: logs.filter((l) => l.alertStatusAtVerification === "WARNING").length,
    watchlistCritical: logs.filter((l) => l.alertStatusAtVerification === "CRITICAL").length,
  };

  // --- Chart aggregations derived from the same dataset ---
  const chartData = {
    decisions: {
      verified: statistics.verified,
      pending: statistics.pendingReview,
      rejected: statistics.rejected,
    },
    directionBreakdown: { entry: statistics.entries, exit: statistics.exits },
    watchlistBreakdown: {
      none: logs.filter((l) => (l.alertStatusAtVerification ?? "NONE") === "NONE").length,
      warning: statistics.watchlistWarnings,
      critical: statistics.watchlistCritical,
    },
    byCheckpoint: Array.from(
      logs.reduce((map, l) => {
        const name = l.checkpoint?.name ?? "Unknown";
        map.set(name, (map.get(name) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    overTime: Array.from(
      logs.reduce((map, l) => {
        const day = l.timestamp.toISOString().slice(0, 10);
        map.set(day, (map.get(day) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    )
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };

  // --- Trimmed historical record snapshot for the viewer/export ---
  const recordsSnapshot = logs.map((l) => ({
    verificationId: l.id,
    timestamp: l.timestamp.toISOString(),
    direction: l.direction,
    fingerprintScore: l.fingerprintScore,
    irisScore: l.irisScore,
    finalScore: l.finalScore,
    threshold: l.threshold,
    systemDecision: l.systemDecision,
    finalDecision: l.finalDecision,
    decisionReason: l.decisionReason,
    alertStatusAtVerification: l.alertStatusAtVerification ?? "NONE",
    alertReasonAtVerification: l.alertReasonAtVerification,
    checkpointName: l.checkpoint?.name ?? null,
    checkpointLocation: l.checkpoint?.location ?? null,
    officerName: l.officer?.name ?? null,
    travelerName: l.traveler?.fullName ?? null,
    travelerFan: l.traveler?.fan ?? null,
    travelerNationality: l.traveler?.nationality ?? null,
    manualReview: l.manualReviewRequest
      ? {
          status: l.manualReviewRequest.status,
          reason: l.manualReviewRequest.reason,
          decision: l.manualReviewRequest.decision,
          supervisorNotes: l.manualReviewRequest.supervisorNotes,
          supervisorName: l.manualReviewRequest.supervisor?.name ?? null,
          decidedAt: l.manualReviewRequest.updatedAt.toISOString(),
        }
      : null,
  }));

  // --- Human-readable filter labels persisted with the snapshot ---
  let officerLabel = "All Officers";
  if (filters.officerId !== undefined) {
    const u = await prisma.user.findUnique({ where: { id: filters.officerId }, select: { name: true } });
    officerLabel = u?.name ?? `Officer #${filters.officerId}`;
  }
  let checkpointLabel = "All Checkpoints";
  if (filters.checkpointId !== undefined) {
    const c = await prisma.checkpoint.findUnique({ where: { id: filters.checkpointId }, select: { name: true } });
    checkpointLabel = c?.name ?? `Checkpoint #${filters.checkpointId}`;
  }

  const filterLabels = {
    officer: officerLabel,
    checkpoint: checkpointLabel,
    direction: filters.direction ?? "All Directions",
    decision: filters.decision ?? "All Decisions",
    watchlistStatus: filters.alertStatus ?? "All Statuses",
  };

  const report = await prisma.report.create({
    data: {
      reportType: "BORDER_CROSSING",
      reportTitle,
      startDate: start,
      endDate: end,
      generatedBy,
      recordCount: recordsSnapshot.length,
      filters: { ...filters, labels: filterLabels } as any,
      summaryData: statistics as any,
      chartData: chartData as any,
      recordsData: recordsSnapshot as any,
    },
    include: {
      generatedByUser: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  return report;
}
