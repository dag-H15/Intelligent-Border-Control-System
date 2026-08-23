import { Request, Response, NextFunction } from "express";
import { findTravelerByFan } from "../services/travelerService";
import { logAuditEvent, getClientIp, AuditResult } from "../services/auditService";
import { AuditLevel } from "../../generated/prisma";

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
