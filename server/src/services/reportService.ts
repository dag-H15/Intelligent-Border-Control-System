import prisma from "../config/prisma";

interface DateRange {
  startDate: string | Date;
  endDate: string | Date;
  generatedBy: number;
}

/**
 * Verification summary: counts of each decision outcome within the range.
 */
export async function generateVerificationSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = new Date(startDate);
  const end = new Date(endDate);

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
      startDate: start,
      endDate: end,
      generatedBy,
    },
  });

  return { report, summary };
}

/**
 * Override summary: counts of supervisor overrides within the range,
 * grouped by the decision the supervisor issued.
 */
export async function generateOverrideSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = new Date(startDate);
  const end = new Date(endDate);

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
      startDate: start,
      endDate: end,
      generatedBy,
    },
  });

  return { report, summary };
}

/**
 * Officer activity: verification attempts per officer within the range.
 */
export async function generateOfficerActivity({ startDate, endDate, generatedBy }: DateRange) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const logs = await prisma.verificationLog.findMany({
    where: { timestamp: { gte: start, lte: end } },
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
    data: {
      reportType: "OFFICER_ACTIVITY",
      startDate: start,
      endDate: end,
      generatedBy,
    },
  });

  return { report, summary: Array.from(byOfficer.values()) };
}

/** Lists all previously generated report metadata records. */
export async function listReports() {
  return prisma.report.findMany({
    orderBy: { createdAt: "desc" },
    include: { generatedByUser: { select: { name: true, role: true } } },
  });
}

export async function generateManualReviewSummary({ startDate, endDate, generatedBy }: DateRange) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const requests = await prisma.manualReviewRequest.findMany({
    where: {
      status: { in: ["APPROVED", "REJECTED", "RE_ENROLLMENT_REQUESTED"] },
      updatedAt: { gte: start, lte: end },
    },
    include: {
      traveler: { select: { fullName: true, fan: true } },
      officer: { select: { name: true } },
      supervisor: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const summary = requests.map((r) => ({
    id: r.id,
    travelerName: r.traveler.fullName,
    passportNo: r.traveler.fan,
    manualReviewType: r.reason,
    officer: r.officer.name,
    supervisor: r.supervisor?.name ?? "System",
    decision: r.status,
    submissionDate: r.createdAt.toISOString(),
    reviewDate: r.updatedAt.toISOString(),
  }));

  const report = await prisma.report.create({
    data: {
      reportType: "MANUAL_REVIEW_SUMMARY",
      startDate: start,
      endDate: end,
      generatedBy,
    },
  });

  return { report, summary };
}