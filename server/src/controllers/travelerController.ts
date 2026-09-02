import { Request, Response, NextFunction } from "express";
import { findTravelerByFan, identifyTravelerByFingerprint } from "../services/travelerService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });
export const fingerprintIdentifyUpload = upload.single("fingerprintImage");

export async function lookupTraveler(req: Request, res: Response, next: NextFunction) {
  try {
    const fan = String(req.params.fan || "").trim();
    if (!fan) {
      return res.status(400).json({ message: "fan is required" });
    }

    const traveler = await findTravelerByFan(fan);
    if (!traveler) {
      await logAuditEvent({
        userId: req.user!.userId,
        action: "Traveler lookup failed",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "Traveler",
        resourceId: fan,
        description: `No traveler found for FAN ${fan}`,
      });
      return res.status(404).json({ message: "Traveler not found" });
    }

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Traveler lookup",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Traveler",
      resourceId: String(traveler.id),
      description: `Looked up ${traveler.fullName} (FAN: ${fan}) — alert status ${traveler.alertStatus}`,
      metadata: { fan, alertStatus: traveler.alertStatus },
    });

    return res.status(200).json({
      id: traveler.id,
      fan: traveler.fan,
      fullName: traveler.fullName,
      dateOfBirth: traveler.dateOfBirth.toISOString().slice(0, 10),
      gender: traveler.gender,
      nationality: traveler.nationality,
      photo: traveler.photo,
      enrollmentStatus: traveler.enrollmentStatus,
      alertStatus: traveler.alertStatus,
      alertReason: traveler.alertReason,
    });
  } catch (err) {
    next(err);
  }
}

export async function identifyTravelerByFingerprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const fileBuffer = req.file?.buffer;
    const bodySource = req.body?.fingerprintImage || req.body?.fingerprintData || req.body?.image;
    const fingerprintSource = fileBuffer || bodySource;

    if (!fingerprintSource) {
      return res.status(400).json({ message: "fingerprintImage or fingerprintData is required for fingerprint identification" });
    }

    const result = await identifyTravelerByFingerprint(fingerprintSource);

    if (!result || !result.traveler) {
      await logAuditEvent({
        userId: req.user!.userId,
        action: "Fingerprint Identification Failed",
        ipAddress: getClientIp(req),
        severity: AuditLevel.WARNING,
        result: AuditResult.FAILED,
        resourceType: "Traveler",
        description: "No matching traveler found for scanned fingerprint",
      });
      return res.status(404).json({ message: "No enrolled traveler matches the scanned fingerprint." });
    }

    const { traveler, score } = result;

    await logAuditEvent({
      userId: req.user!.userId,
      action: "Fingerprint Identification Success",
      ipAddress: getClientIp(req),
      severity: AuditLevel.INFO,
      result: AuditResult.SUCCESS,
      resourceType: "Traveler",
      resourceId: String(traveler.id),
      description: `Identified traveler ${traveler.fullName} (FAN: ${traveler.fan}) via 1:N fingerprint search with confidence score ${score}%`,
      metadata: { travelerId: traveler.id, fan: traveler.fan, matchScore: score },
    });

    return res.status(200).json({
      id: traveler.id,
      fan: traveler.fan,
      fullName: traveler.fullName,
      dateOfBirth: traveler.dateOfBirth.toISOString().slice(0, 10),
      gender: traveler.gender,
      nationality: traveler.nationality,
      photo: traveler.photo,
      enrollmentStatus: traveler.enrollmentStatus,
      alertStatus: traveler.alertStatus,
      alertReason: traveler.alertReason,
      matchScore: score,
    });
  } catch (err) {
    next(err);
  }
}

