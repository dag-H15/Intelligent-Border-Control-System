import { Request, Response, NextFunction } from "express";
import { createTraveler, captureBiometric } from "../services/enrollmentService";
import { createAuditLog, getClientIp } from "../services/auditService";
import { AuditLevel, Gender } from "../../generated/prisma";

const VALID_GENDERS: Gender[] = ["MALE", "FEMALE"];

/**
 * POST /api/enrollment/traveler
 * Creates the traveler's demographic record (Step 1 of enrollment).
 */
export async function createTravelerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { fan, fullName, dateOfBirth, gender, nationality, photo } = req.body;

    if (!fan || !fullName || !dateOfBirth || !gender || !nationality) {
      await createAuditLog(
        req.user!.userId,
        "Invalid traveler enrollment request: missing required fields",
        getClientIp(req),
        AuditLevel.WARNING
      );
      return res.status(400).json({
        message: "fan, fullName, dateOfBirth, gender, and nationality are required",
      });
    }

    if (!VALID_GENDERS.includes(gender)) {
      await createAuditLog(
        req.user!.userId,
        `Invalid traveler enrollment request: unsupported gender ${gender}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
      return res.status(400).json({ message: `gender must be one of: ${VALID_GENDERS.join(", ")}` });
    }

    const traveler = await createTraveler({ fan, fullName, dateOfBirth, gender, nationality, photo });

    await createAuditLog(
      req.user!.userId,
      `Enrollment started for traveler (FAN: ${fan})`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json({ traveler });
  } catch (err) {
    if ((err as any)?.statusCode === 409) {
      await createAuditLog(
        req.user!.userId,
        `Duplicate enrollment attempt for traveler (FAN: ${req.body.fan})`,
        getClientIp(req),
        AuditLevel.WARNING
      );
    }
    next(err);
  }
}

/**
 * POST /api/enrollment/biometric
 * Stores biometric templates and completes enrollment (Step 2).
 */
export async function captureBiometricHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { fan, fingerprintTemplate, irisTemplate } = req.body;

    if (!fan || !fingerprintTemplate || !irisTemplate) {
      await createAuditLog(
        req.user!.userId,
        `Invalid biometric enrollment request for FAN ${fan || "unknown"}: missing required fields`,
        getClientIp(req),
        AuditLevel.WARNING
      );
      return res.status(400).json({
        message: "fan, fingerprintTemplate, and irisTemplate are required",
      });
    }

    const result = await captureBiometric({
      fan,
      fingerprintTemplate,
      irisTemplate,
      capturedBy: req.user!.userId,
    });

    await createAuditLog(
      req.user!.userId,
      `Biometric captured, traveler enrolled (FAN: ${fan})`,
      getClientIp(req),
      AuditLevel.INFO
    );

    return res.status(201).json({
      traveler: result.traveler,
      biometric: {
        id: result.biometric.id,
        travelerId: result.biometric.travelerId,
        capturedBy: result.biometric.capturedBy,
        createdAt: result.biometric.createdAt,
        updatedAt: result.biometric.updatedAt,
        // Raw template bytes are intentionally omitted from the response
      },
    });
  } catch (err) {
    if ((err as any)?.statusCode === 409) {
      await createAuditLog(
        req.user!.userId,
        `Duplicate biometric enrollment attempt for FAN ${req.body.fan}: ${(err as Error).message}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
    } else if ((err as any)?.statusCode === 404) {
      await createAuditLog(
        req.user!.userId,
        `Invalid biometric enrollment attempt for FAN ${req.body.fan}: ${(err as Error).message}`,
        getClientIp(req),
        AuditLevel.WARNING
      );
    }
    next(err);
  }
}