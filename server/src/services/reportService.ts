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
    data: { reportType: "VERIFICATION_SUMMARY", startDate: start, endDate: end, generatedBy },
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
    data: { reportType: "OVERRIDE_SUMMARY", startDate: start, endDate: end, generatedBy },
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

  const report = await prisma.report.create({
    data: { reportType: "OFFICER_ACTIVITY", startDate: start, endDate: end, generatedBy },
  });

  return { report, summary: Array.from(byOfficer.values()) };
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
    data: { reportType: "MANUAL_REVIEW_SUMMARY", startDate: start, endDate: end, generatedBy },
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
