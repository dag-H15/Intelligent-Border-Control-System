import prisma from "../config/prisma";
import { Prisma, ManualReviewDecision, ManualReviewReason, ManualReviewStatus } from "../../generated/prisma";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png"]);

export interface ManualReviewAttachment {
  originalName: string;
  mimeType: string;
  size: number;
  data: string;
}

export interface CreateManualReviewInput {
  travelerId: number;
  officerId: number;
  verificationId?: number;
  reason: ManualReviewReason;
  officerNotes: string;
  files?: Express.Multer.File[];
}

export interface DecideManualReviewInput {
  requestId: number;
  supervisorId: number;
  decision: ManualReviewDecision;
  notes: string;
}

function validateAttachment(file: Express.Multer.File) {
  const extension = file.originalname.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(extension)) {
    const error = new Error('Attachments must be PDF, JPG, or PNG files only.');
    (error as any).statusCode = 400;
    throw error;
  }
}

function toAttachment(file: Express.Multer.File): ManualReviewAttachment {
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    data: file.buffer.toString('base64'),
  };
}

export async function createManualReviewRequest(input: CreateManualReviewInput) {
  const { travelerId, officerId, verificationId, reason, officerNotes, files = [] } = input;

  if (files.length > 5) {
    const error = new Error('You can upload at most 5 files.');
    (error as any).statusCode = 400;
    throw error;
  }

  for (const file of files) {
    if (file.size > 10 * 1024 * 1024) {
      const error = new Error('Each file must be 10 MB or smaller.');
      (error as any).statusCode = 400;
      throw error;
    }
    validateAttachment(file);
  }

  const manualReview = await prisma.manualReviewRequest.create({
    data: {
      travelerId,
      officerId,
      verificationId,
      reason,
      officerNotes,
      attachments: files.map(toAttachment) as unknown as Prisma.InputJsonValue,
    },
    include: {
      traveler: { select: { fan: true, fullName: true, enrollmentStatus: true } },
      officer: { select: { id: true, name: true } },
      verification: {
        select: {
          id: true,
          fingerprintScore: true,
          irisScore: true,
          finalScore: true,
          finalDecision: true,
        },
      },
    },
  });

  return manualReview;
}

export async function listPendingManualReviews() {
  return prisma.manualReviewRequest.findMany({
    where: { status: ManualReviewStatus.PENDING },
    orderBy: { createdAt: "desc" },
    include: {
      traveler: { select: { fan: true, fullName: true, enrollmentStatus: true } },
      officer: { select: { id: true, name: true } },
      verification: {
        select: {
          id: true,
          fingerprintScore: true,
          irisScore: true,
          finalScore: true,
          finalDecision: true,
        },
      },
    },
  });
}

export async function decideManualReview(input: DecideManualReviewInput) {
  const { requestId, supervisorId, decision, notes } = input;

  const request = await prisma.manualReviewRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    const error = new Error('Manual review request not found');
    (error as any).statusCode = 404;
    throw error;
  }

  if (request.status !== ManualReviewStatus.PENDING) {
    const error = new Error('This manual review request is no longer pending');
    (error as any).statusCode = 409;
    throw error;
  }

  if (request.verificationId) {
    const vLog = await prisma.verificationLog.findUnique({ where: { id: request.verificationId } });
    if (vLog) {
      const vDecision = decision === ManualReviewDecision.APPROVED_OVERRIDE ? "VERIFIED" : "REJECTED";
      
      await prisma.verificationLog.update({
        where: { id: request.verificationId },
        data: { finalDecision: vDecision },
      });

      await prisma.overrideRecord.create({
        data: {
          verificationId: request.verificationId,
          supervisorId,
          previousDecision: vLog.finalDecision || "PENDING_SUPERVISOR_REVIEW",
          newDecision: vDecision,
          reason: notes,
        },
      });
    }
  }

  return prisma.manualReviewRequest.update({
    where: { id: requestId },
    data: {
      supervisorId,
      decision,
      supervisorNotes: notes,
      status:
        decision === ManualReviewDecision.APPROVED_OVERRIDE
          ? ManualReviewStatus.APPROVED
          : decision === ManualReviewDecision.REQUEST_RE_ENROLLMENT
          ? ManualReviewStatus.RE_ENROLLMENT_REQUESTED
          : ManualReviewStatus.REJECTED,
    },
    include: {
      traveler: { select: { fan: true, fullName: true, enrollmentStatus: true } },
      officer: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      verification: {
        select: {
          id: true,
          fingerprintScore: true,
          irisScore: true,
          finalScore: true,
          finalDecision: true,
        },
      },
    },
  });
}

export async function getManualReviewHistory(supervisorId?: number) {
  const whereClause: Prisma.ManualReviewRequestWhereInput = {
    status: { in: [ManualReviewStatus.APPROVED, ManualReviewStatus.REJECTED, ManualReviewStatus.RE_ENROLLMENT_REQUESTED] },
  };
  if (supervisorId !== undefined) {
    whereClause.supervisorId = supervisorId;
  }
  return prisma.manualReviewRequest.findMany({
    where: whereClause,
    orderBy: { updatedAt: "desc" },
    include: {
      traveler: { select: { fan: true, fullName: true, enrollmentStatus: true } },
      officer: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      verification: {
        select: {
          id: true,
          fingerprintScore: true,
          irisScore: true,
          finalScore: true,
          finalDecision: true,
        },
      },
    },
  });
}